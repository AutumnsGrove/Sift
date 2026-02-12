// Sift — Photo Processing Pipeline
// Processes images via Llama 4 Scout (native multimodal) and extracts tasks

import type { Env, TelegramMessage, ConversationMessage, TriagedTask, TriageResult } from '../types';
import { downloadFile } from '../telegram';
import { createTask } from '../db/tasks';
import { createDump, markDumpProcessed } from '../db/dumps';
import { getConversation, addMessage } from '../db/conversations';
import { callVisionAI } from '../ai/provider';

const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB limit

const VISION_SYSTEM_PROMPT = `You are Sift, a personal task triage assistant. The user sent a photo. Analyze it and extract any actionable tasks.

The image might be:
- A screenshot of a to-do list, email, or message → extract the action items
- A whiteboard or handwritten notes → OCR and extract tasks
- A receipt or document → extract follow-up actions (e.g., "expense this", "file this")
- A photo of something → identify what needs doing if anything

For each task found, determine:
- title: concise, action-oriented (3-8 words)
- description: context from the image
- priority: critical | high | medium | low | someday
- category: infer from context
- due_date: extract if visible (ISO 8601 YYYY-MM-DD), null otherwise
- tags: relevant keywords
- ai_notes: what you saw in the image that prompted this task

If the image doesn't contain actionable items, describe what you see and ask if the user wants to capture anything.

Respond with valid JSON only. No markdown, no code fences.

Response format:
{
  "tasks": [
    {
      "title": "...",
      "description": "...",
      "priority": "...",
      "category": "...",
      "due_date": "...",
      "tags": ["..."],
      "ai_notes": "..."
    }
  ],
  "image_description": "Brief description of what's in the image",
  "response": "Conversational response with [▦ From image] tag. Use ● (critical/high) ◐ (medium) ○ (low/someday) symbols."
}`;

/** Process a photo message through the vision pipeline */
export async function handlePhotoMessage(
  env: Env,
  message: TelegramMessage
): Promise<string> {
  const photos = message.photo;
  if (!photos || photos.length === 0) {
    return "I couldn't process that image. Try sending it again.";
  }

  // Get the largest photo (Telegram sends multiple sizes, last is largest)
  const largestPhoto = photos[photos.length - 1]!;

  // Check file size before downloading
  if (largestPhoto.file_size && largestPhoto.file_size > MAX_IMAGE_SIZE) {
    return "That image is too large for me to process. Try a smaller one (under 5MB).";
  }

  // Download the image
  const imageData = await downloadFile(env, largestPhoto.file_id);
  if (!imageData) {
    return "I couldn't download that image from Telegram. Try sending it again.";
  }

  // Enforce size limit on actual download
  if (imageData.byteLength > MAX_IMAGE_SIZE) {
    return "That image is too large for me to process. Try a smaller one (under 5MB).";
  }

  // Convert to base64 data URI for Llama 4 Scout
  const base64 = arrayBufferToBase64(imageData);
  const dataUri = `data:image/jpeg;base64,${base64}`;

  // Get conversation context
  const history = await getConversation(env.DB);

  // Include caption if provided
  const caption = message.caption ?? '';

  // Log the raw dump
  const dump = await createDump(env.DB, {
    telegram_message_id: String(message.message_id),
    input_type: 'photo',
    raw_content: caption || '[photo]',
  });

  // Run vision model
  const result = await processImageWithVision(env, dataUri, caption, history);

  // Create tasks from the results
  const taskIds: string[] = [];
  for (const triaged of result.tasks) {
    const task = await createTask(env.DB, {
      title: triaged.title,
      description: triaged.description,
      priority: triaged.priority,
      category: triaged.category,
      due_date: triaged.due_date,
      tags: triaged.tags,
      source_type: 'photo',
      raw_input: result.imageDescription ?? caption,
      ai_notes: triaged.ai_notes,
    });
    taskIds.push(task.id);
  }

  // Mark dump as processed
  await markDumpProcessed(env.DB, dump.id, taskIds);

  // Save conversation context
  await addMessage(env.DB, 'user', `[sent a photo]${caption ? ` ${caption}` : ''}`);
  await addMessage(env.DB, 'assistant', result.response);

  return result.response;
}

interface VisionResult {
  tasks: TriagedTask[];
  imageDescription: string;
  response: string;
}

/** Send image to vision model (via provider abstraction) */
async function processImageWithVision(
  env: Env,
  dataUri: string,
  caption: string,
  conversationHistory: ConversationMessage[]
): Promise<VisionResult> {
  // Build prompt with system instructions and context
  let prompt = VISION_SYSTEM_PROMPT;

  // Add recent conversation context
  if (conversationHistory.length > 0) {
    prompt += '\n\nRecent conversation:\n';
    for (const msg of conversationHistory.slice(-6)) {
      prompt += `${msg.role}: ${msg.content}\n`;
    }
  }

  // Add user caption if provided
  if (caption) {
    prompt += `\n\nUser's caption: "${caption}"`;
  } else {
    prompt += '\n\nAnalyze this image and extract any actionable tasks.';
  }

  // Call vision AI via provider abstraction
  const responseText = await callVisionAI(env, prompt, dataUri);

  return parseVisionResponse(responseText);
}

/** Parse the vision model response */
function parseVisionResponse(raw: string): VisionResult {
  try {
    let jsonStr = raw.trim();
    const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch?.[1]) {
      jsonStr = fenceMatch[1].trim();
    }

    const parsed = JSON.parse(jsonStr) as {
      tasks?: TriagedTask[];
      image_description?: string;
      response?: string;
    };

    const tasks: TriagedTask[] = (parsed.tasks ?? []).map((t) => ({
      title: String(t.title ?? '').slice(0, 200),
      description: t.description ? String(t.description).slice(0, 1000) : undefined,
      priority: validatePriority(t.priority),
      category: t.category ? String(t.category).slice(0, 50) : undefined,
      due_date: t.due_date ? String(t.due_date) : undefined,
      tags: Array.isArray(t.tags) ? t.tags.map(String).slice(0, 10) : undefined,
      ai_notes: t.ai_notes ? String(t.ai_notes).slice(0, 500) : undefined,
    }));

    const imageDescription = parsed.image_description ?? '';

    // Ensure [▦ From image] tag is in the response
    let response = parsed.response ?? formatDefaultVisionResponse(tasks, imageDescription);
    if (!response.includes('▦')) {
      response = `[▦ From image] ${response}`;
    }

    return { tasks, imageDescription, response };
  } catch {
    return {
      tasks: [],
      imageDescription: '',
      response: "[▦ From image] I looked at the image but couldn't parse any tasks from it. Can you describe what you'd like me to capture?",
    };
  }
}

function validatePriority(p: unknown): TriagedTask['priority'] {
  const valid = ['critical', 'high', 'medium', 'low', 'someday'] as const;
  if (typeof p === 'string' && valid.includes(p as (typeof valid)[number])) {
    return p as TriagedTask['priority'];
  }
  return 'medium';
}

function formatDefaultVisionResponse(tasks: TriagedTask[], description: string): string {
  if (tasks.length === 0) {
    return `[▦ From image] I see: ${description || 'an image'}. I didn't spot any obvious tasks. Want me to capture something from it?`;
  }

  const prioritySymbol = (p: string) => {
    switch (p) {
      case 'critical':
      case 'high':
        return '●';
      case 'medium':
        return '◐';
      default:
        return '○';
    }
  };

  const lines = tasks.map(
    (t) => `${prioritySymbol(t.priority)} ${t.title}`
  );

  return `[▦ From image] Extracted ${tasks.length} task${tasks.length > 1 ? 's' : ''}:\n\n${lines.join('\n')}\n\nAll saved. Anything to adjust?`;
}

/** Convert ArrayBuffer to base64 string */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}
