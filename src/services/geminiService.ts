import { GoogleGenAI, Type, Part } from "@google/genai";
import { ApiConfig, AnimeShot, UploadedImage } from "../types";

let lastRawResponse = "";

export const getLastRawResponse = () => lastRawResponse;

export async function generateAnimeScript(input: string, config: ApiConfig, images: UploadedImage[] = []): Promise<AnimeShot[]> {
  const imageNames = images.map(img => img.name.replace(/\.[^/.]+$/, "")).join(", ");
  const prompt = `你是一位世界级的动漫导演和分镜规划师。我需要用下面这段剧情在seedance 2.0做动画，请将以下输入转换成专业的、电影级的动漫脚本，包含顶级的CG级镜头。

输入内容: "${input}"
${images.length > 0 ? `参考图片列表: ${imageNames}` : ""}

重要指令：
1. **视觉分析优先**：如果你收到了参考图片，你必须首先深度分析图片中角色的穿着（如：夹克、卫衣、制服）、颜色、发型、配饰以及场景特征。
2. **严禁凭空想象描述**：在生成 "description"（画面描述）和 "action"（动作）时，必须严格遵守参考图中的视觉细节。例如：如果参考图中角色穿着夹克，在脚本描述中绝不能写成“短袖”或“ T恤”。所有视觉描述必须基于图片中的客观事实。
3. **视觉一致性**：确保在所有生成的镜头中，角色的穿着、长相和场景细节都保持高度一致。

4. **时长逻辑要求**：请根据对白的字数合理计算每个镜头的 "duration"。通常情况下，中文语音的播放速度约为每秒 2-3 个字。例如：若对白有 12 个字，时长应设置为 4s 到 6s。如果没有任何对白，普通镜头通常为 2s 到 3s。

要求:
1. 在没有要求的情况下，按照参考图分析全局风格
2. 确保 "global_style" 针对高质量生成进行了优化（例如："杰作，最佳质量，细节丰富，电影级光效"）。该字段请使用中文编写，不要包含 "8k" 或 "8k分辨率" 等关键词。
3. **所有字段必须使用中文编写，且每句话的结尾必须加上句号。**
4. 如果输入中涉及到参考图片中的角色或场景，请在 "description" 或 "action" 字段中直接提及。如果需要标注引用，请用 "文件名" 的格式（如：小明），但不要包含文件后缀。
5. 运镜字段必须包含景别（如：特写、中景、远景、俯拍、仰拍）以及动态运镜描述（如：推镜头、拉镜头、摇镜头、移镜头、环绕镜头等）。
6. **输出必须仅包含有效的 JSON 数据，严禁包含任何前言、后记、解释文字、或 Markdown 代码块包裹（即不要使用 \`\`\`json 开始或结束）。**

每个镜头的字段说明：
- global_style (全局风格与画质基地：即分镜图提示词 Storyboard prompt，请使用中文描述，针对高质量图像生成优化，不含8k关键词)
- duration (时长，例如 "1.5s", "3s")
- camera_movement (运镜：必须包含景别描述，以及推拉摇移、环绕、倒放、快进等专业的运镜描述)
- description (画面描述：视觉效果、环境细节、CG级精度。若涉及参考图请用"文件名"标注)
- action (动作：角色移动、细微表情、肢体冲突，尽量不要描写服饰。若涉及参考图请用"文件名"标注)
- positioning (站位描述：角色在画面中的相对位置)
- lighting (光影逻辑：光轴方向、色温、阴影强度、丁达尔效应等)
- background (背景细节：详细描述环境、建筑、材质、天气、远景细节，确保镜头衔接不穿帮，需要非常详细描述)
- fx (顶级特效拆解：粒子、流体、爆破效果、能量流动)
- sfx (音效描述：环境音、打击感)
- dialogue (对白：详细描述角色此时所说的话，格式为“角色名：对白内容”，例如“小明：这就是我梦寐以求的力量。”。如果没有对白则填“无”)
- music (音乐：该字段固定填“无”)
`;

  if (config.provider === 'google') {
    return callGoogleGemini(prompt, config, true, images);
  } else {
    return callOpenAICompatible(prompt, config, true, images);
  }
}

export async function regenerateShot(
  fullScript: AnimeShot[],
  targetIndex: number,
  instruction: string,
  config: ApiConfig,
  images: UploadedImage[] = []
): Promise<AnimeShot> {
  const imageNames = images.map(img => img.name.replace(/\.[^/.]+$/, "")).join(", ");
  const prompt = `你是一位世界级的动漫导演。我有一段包含 ${fullScript.length} 个镜头的脚本。
我需要你根据特定指令【重新生成】第 ${targetIndex + 1} 个镜头，同时保持与前一个和后一个镜头的连贯性。

全案脚本上下文（仅参考连贯性）：
${fullScript.map((s, i) => `镜头 ${i + 1}: ${s.description}`).join("\n")}

当前目标镜头内容：
${JSON.stringify(fullScript[targetIndex], null, 2)}

修改指令: "${instruction}"
${images.length > 0 ? `参考图片列表: ${imageNames}` : ""}

重要指令：
1. **视觉分析优先**：如果你收到了参考图片，必须深度分析图片中角色的穿着、颜色、发型及场景特征。
2. **视觉高度一致**：重新生成的镜头必须与上下文及参考图中的视觉细节（如：夹克、卫衣、场景细节）保持绝对一致。
3. **严禁凭空想象描述**：如果参考图中角色穿着夹克，在脚本描述中绝不能写成“短袖”。

要求：
1. **输出必须仅包含重新生成的第 ${targetIndex + 1} 个镜头的 JSON 对象，严禁包含任何前言、后记、解释文字、或 Markdown 代码块包裹。**
2. 确保顶级 CG 级别的画面描述。
3. **所有字段必须使用中文编写，且每句话的结尾必须加上句号。**
4. 如果需要提及参考图中的角色，请直接使用 "文件名"（如：小明），不要使用特殊前缀。
5. 运镜字段必须包含景别（如：特写、中景等）。

6. **时长逻辑要求**：请根据对白的字数合理计算每个镜头的 "duration"。通常情况下，中文语音的播放速度约为每秒 2-3 个字。例如：若对白有 12 个字，时长应设置为 4s 到 6s。如果没有任何对白，普通镜头通常为 2s 到 3s。

所需 JSON 字段：
- global_style (全局风格与画质基地：请根据参考图或上下文分析，不含8k关键词)
- duration (时长)
- camera_movement (运镜：必须包含景别描述)
- description (画面描述：使用"文件名"标注参考图)
- action (动作描述：尽量不要描写服饰。使用"文件名"标注参考图)
- positioning (站位描述)
- lighting (光影逻辑)
- background (背景细节：详细描述环境、远景，确保衔接一致)
- fx (顶级特效)
- sfx (音效描述)
- dialogue (对白描述：详细描述角色此时所说的话，格式为“角色名：对白内容”，例如“小明：这就是我梦寐以求的力量。”。若无对白填“无”)
- music (音乐：固定填“无”)
`;

  if (config.provider === 'google') {
    return callGoogleGemini(prompt, config, false, images);
  } else {
    return callOpenAICompatible(prompt, config, false, images);
  }
}

function extractJson(content: string): string {
  if (!content) return "";
  
  // First, remove markdown code blocks
  let cleaned = content.replace(/```json\n?|```/g, "").trim();
  
  // Find the first occurrence of { or [
  const startBrace = cleaned.indexOf("{");
  const startBracket = cleaned.indexOf("[");
  
  let startIndex = -1;
  if (startBrace !== -1 && startBracket !== -1) {
    startIndex = Math.min(startBrace, startBracket);
  } else {
    startIndex = startBrace !== -1 ? startBrace : startBracket;
  }

  if (startIndex === -1) return cleaned;

  // Find the last occurrence of } or ]
  let endBrace = cleaned.lastIndexOf("}");
  let endBracket = cleaned.lastIndexOf("]");
  
  // Robustness for truncated JSON:
  // If it's an array of objects and it was truncated, find the last COMPLETE object
  if (startIndex === startBracket) {
    // If the string doesn't end with ], it might be truncated
    if (endBracket < endBrace) {
      // Potentially truncated after the last object. Fix by appending ]
      return cleaned.substring(startIndex, endBrace + 1) + "]";
    }
  }

  const endIndex = Math.max(endBrace, endBracket);
  if (endIndex === -1 || endIndex < startIndex) return cleaned;

  return cleaned.substring(startIndex, endIndex + 1);
}

async function callGoogleGemini(prompt: string, config: ApiConfig, isArray: boolean, images: UploadedImage[] = []): Promise<any> {
  const apiKey = config.apiKey || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("请在设置中配置 Google Gemini API Key。");
  }
  
  const ai = new GoogleGenAI({ apiKey });
  
  // Normalize model ID - Use gemini-3-flash-preview as default for text tasks
  let modelId = config.model || "gemini-3-flash-preview";
  if (modelId === "gemini-1.5-flash" || modelId === "models/gemini-1.5-flash") {
    modelId = "gemini-3-flash-preview";
  }
  
  const imageParts: Part[] = images.map(img => ({
    inlineData: {
      data: img.base64.split(",")[1], // Remove mime type prefix
      mimeType: img.type
    }
  }));

  const schema = isArray ? {
    type: Type.ARRAY,
    items: {
      type: Type.OBJECT,
      properties: {
        global_style: { type: Type.STRING },
        duration: { type: Type.STRING },
        camera_movement: { type: Type.STRING },
        description: { type: Type.STRING },
        action: { type: Type.STRING },
        positioning: { type: Type.STRING },
        lighting: { type: Type.STRING },
        background: { type: Type.STRING },
        fx: { type: Type.STRING },
        sfx: { type: Type.STRING },
        dialogue: { type: Type.STRING },
        music: { type: Type.STRING },
      },
      required: ["global_style", "duration", "camera_movement", "description", "action", "positioning", "lighting", "background", "fx", "sfx", "dialogue", "music"],
    }
  } : {
    type: Type.OBJECT,
    properties: {
      global_style: { type: Type.STRING },
      duration: { type: Type.STRING },
      camera_movement: { type: Type.STRING },
      description: { type: Type.STRING },
      action: { type: Type.STRING },
      positioning: { type: Type.STRING },
      lighting: { type: Type.STRING },
      background: { type: Type.STRING },
      fx: { type: Type.STRING },
      sfx: { type: Type.STRING },
      dialogue: { type: Type.STRING },
      music: { type: Type.STRING },
    },
    required: ["global_style", "duration", "camera_movement", "description", "action", "positioning", "lighting", "background", "fx", "sfx", "dialogue", "music"],
  };

  const response = await ai.models.generateContent({
    model: modelId,
    contents: [{ parts: [{ text: prompt }, ...imageParts] }],
    config: {
      responseMimeType: "application/json",
      responseSchema: schema as any,
    }
  });

  const text = response.text;
  lastRawResponse = text || "";
  
  if (!text) throw new Error("AI did not return any text");
  
  let json;
  try {
    json = JSON.parse(extractJson(text));
  } catch (e) {
    console.error("[Gemini Parse Error] Raw text:", text);
    throw new Error("AI 生成的内容无法解析为 JSON，请重试");
  }
  
  if (isArray) {
    return json.map(mapShot);
  }
  return mapShot(json);
}

async function callOpenAICompatible(prompt: string, config: ApiConfig, isArray: boolean, images: UploadedImage[] = []): Promise<any> {
  let baseUrl = config.baseUrl || (config.provider === 'grsai' ? 'https://grsaiapi.com/v1' : '');
  
  // Clean trailing slashes
  baseUrl = baseUrl.replace(/\/+$/, '');
  
  // Build URL more carefully
  const url = baseUrl.includes('/chat/completions') ? baseUrl : `${baseUrl}/chat/completions`;
  
  console.log(`[AI Request] ${config.provider} -> ${url}`);
  
  try {
    const messages: any[] = [];
    
    if (images.length > 0 && (config.model.toLowerCase().includes('vision') || config.provider === 'google' || config.provider === 'grsai')) {
      const content: any[] = [{ type: 'text', text: prompt }];
      images.forEach(img => {
        content.push({
          type: 'image_url',
          image_url: { url: img.base64 }
        });
      });
      messages.push({ role: 'user', content });
    } else {
      messages.push({ role: 'user', content: prompt });
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`
      },
      body: JSON.stringify({
        model: config.model,
        messages,
        stream: false,
        // response_format is often not supported by various proxies, better to rely on prompt
      }),
      redirect: 'follow'
    });

    const rawResponseText = await response.text();
    lastRawResponse = rawResponseText;

    if (!response.ok) {
      let errText = rawResponseText;
      try {
        const errorJson = JSON.parse(rawResponseText);
        errText = errorJson.error?.message || errorJson.error?.msg || errorJson.message || rawResponseText;
      } catch {
        // Not JSON, use raw text
      }
      
      console.error(`[AI Error] ${response.status}: ${errText}`);
      throw new Error(errText || `HTTP ${response.status}`);
    }

    let data;
    try {
      data = JSON.parse(rawResponseText);
    } catch (e) {
      console.error("[JSON Parse Error] Raw response:", rawResponseText);
      throw new Error("API 返回了无效的 JSON 格式");
    }
    
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      console.error("[API Error] Missing content in choices:", data);
      throw new Error(data.error?.message || "API 未返回内容，请检查模型权限或额度");
    }
    
    // Clean potential markdown code blocks and extract JSON
    const cleanContent = extractJson(content);
    let json;
    try {
      json = JSON.parse(cleanContent);
    } catch (e) {
      console.error("[Content Parse Error] Cleaned content:", cleanContent);
      console.error("[Original Content]:", content);
      throw new Error("AI 生成的内容无法解析为 JSON，请重试");
    }

    // Some non-standard models might wrap the array in a property if prompt asked for an array but response_format is json_object
    let finalJson = json;
    if (isArray && !Array.isArray(json)) {
      // Look for the first array property
      const arrayKey = Object.keys(json).find(key => Array.isArray(json[key]));
      if (arrayKey) {
        finalJson = json[arrayKey];
      } else {
        throw new Error("API did not return a JSON array as expected.");
      }
    }

    if (isArray) {
      return (Array.isArray(finalJson) ? finalJson : [finalJson]).map(mapShot);
    }
    return mapShot(finalJson);
  } catch (err: any) {
    console.error("[Network Error] Fetch failed:", err);
    // Re-throw so the UI can catch it
    throw err;
  }
}

function mapShot(shot: any): AnimeShot {
  const clean = (str: string) => {
    if (!str) return "";
    // Remove @prefix and .extension suffix from tagged items like @name.png
    return str.replace(/@([^.\s]+)(\.[a-z0-9]+)?/gi, '$1');
  };

  return {
    globalStyle: clean(shot.global_style || ""),
    duration: shot.duration || shot.duration_label || "",
    cameraMovement: clean(shot.camera_movement || shot.cameraMovement || ""),
    description: clean(shot.description || ""),
    action: clean(shot.action || ""),
    positioning: clean(shot.positioning || ""),
    lighting: clean(shot.lighting || ""),
    background: clean(shot.background || ""),
    fx: clean(shot.fx || shot.characteristics || shot.special_effects || ""),
    sfx: clean(shot.sfx || ""),
    dialogue: clean(shot.dialogue || "无"),
    music: clean(shot.music || "无"),
  };
}
