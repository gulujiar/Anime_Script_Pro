import { GoogleGenAI, Type } from "@google/genai";
import { ApiConfig, AnimeShot } from "../types";

export async function generateAnimeScript(input: string, config: ApiConfig): Promise<AnimeShot[]> {
  const prompt = `你是一位世界级的动漫导演和分镜规划师。
请将以下输入转换成专业的、电影级的动漫脚本，包含顶级的CG级镜头。

输入内容: "${input}"

要求:
1. 生成至少 5-8 个详细镜头。
2. 确保 "global_style" 针对高质量生成进行了优化（例如 "masterpiece, best quality, ultra-detailed, anime style, cinematic lighting"）。该字段请保持英文。
3. **除了 global_style 之外，所有其他字段必须使用中文编写。**
4. 输出必须是一个镜头 JSON 数组。

每个镜头的字段说明：
- global_style (全局风格与画质基地：即分镜图提示词 Storyboard prompt，请使用英文描述，针对高质量图像生成优化)
- duration (时长，例如 "1.5s", "3s")
- camera_movement (运镜：推拉摇移、环绕、倒放、快进等专业的运镜描述)
- description (画面描述：视觉效果、环境细节、CG级精度)
- action (动作：角色移动、细微表情、肢体冲突)
- positioning (站位描述：角色在画面中的相对位置)
- lighting (光影逻辑：光轴方向、色温、阴影强度、丁达尔效应等)
- fx (顶级特效拆解：粒子、流体、爆破效果、能量流动)
- sfx (音效描述：环境音、打击感)
- music (音乐：该字段固定填“无”)
`;

  if (config.provider === 'google') {
    return callGoogleGemini(prompt, config, true);
  } else {
    return callOpenAICompatible(prompt, config, true);
  }
}

export async function regenerateShot(
  fullScript: AnimeShot[],
  targetIndex: number,
  instruction: string,
  config: ApiConfig
): Promise<AnimeShot> {
  const prompt = `You are a world-class anime director. I have a script with ${fullScript.length} shots. 
I need you to REGENERATE Shot #${targetIndex + 1} based on a specific instruction, while keeping it consistent with the previous and next shots.

Full Script Context:
${fullScript.map((s, i) => `Shot ${i + 1}: ${s.description}`).join("\n")}

Target Shot current content:
${JSON.stringify(fullScript[targetIndex], null, 2)}

Instruction for regeneration: "${instruction}"

Constraints:
1. Return ONLY the JSON object for the regenerated Shot #${targetIndex + 1}.
2. Ensure high-end CG level descriptions.
3. Keep the overall flow consistent.
4. global_style must be in English.
5. All other fields must be in Chinese.

Required JSON fields:
- global_style (全局风格与画质基地: Storyboard prompt in English)
- duration
- camera_movement
- description
- action
- positioning
- lighting
- fx
- sfx
- music (always "无")
`;

  if (config.provider === 'google') {
    return callGoogleGemini(prompt, config, false);
  } else {
    return callOpenAICompatible(prompt, config, false);
  }
}

async function callGoogleGemini(prompt: string, config: ApiConfig, isArray: boolean): Promise<any> {
  const client = new GoogleGenAI({ apiKey: config.apiKey });
  const modelId = config.model || "gemini-1.5-flash";

  const response = await client.models.generateContent({
    model: modelId,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: isArray ? {
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
            fx: { type: Type.STRING },
            sfx: { type: Type.STRING },
            music: { type: Type.STRING },
          },
          required: ["global_style", "duration", "camera_movement", "description", "action", "positioning", "lighting", "fx", "sfx", "music"],
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
          fx: { type: Type.STRING },
          sfx: { type: Type.STRING },
          music: { type: Type.STRING },
        },
        required: ["global_style", "duration", "camera_movement", "description", "action", "positioning", "lighting", "fx", "sfx", "music"],
      }
    }
  });

  const text = response.text;
  if (!text) throw new Error("AI did not return any text");
  const json = JSON.parse(text);
  
  if (isArray) {
    return json.map(mapShot);
  }
  return mapShot(json);
}

async function callOpenAICompatible(prompt: string, config: ApiConfig, isArray: boolean): Promise<any> {
  const baseUrl = config.baseUrl || (config.provider === 'grsai' ? 'https://grsaiapi.com/v1' : '');
  const url = `${baseUrl}/chat/completions`;
  
  console.log(`[AI Request] ${config.provider} -> ${url}`);
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`
      },
      body: JSON.stringify({
        model: config.model,
        messages: [{ role: 'user', content: prompt }],
        ...(config.provider !== 'volcengine' && { response_format: { type: 'json_object' } })
      })
    });

    if (!response.ok) {
      const err = await response.text();
      console.error(`[AI Error] ${response.status}: ${err}`);
      throw new Error(`API Error: ${err}`);
    }

    const data = await response.json();
    const content = data.choices[0].message.content;
    
    // Clean potential markdown code blocks
    const cleanContent = content.replace(/```json\n?|```/g, '').trim();
    const json = JSON.parse(cleanContent);

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
  return {
    globalStyle: shot.global_style || "",
    duration: shot.duration || shot.duration_label || "",
    cameraMovement: shot.camera_movement || shot.cameraMovement || "",
    description: shot.description || "",
    action: shot.action || "",
    positioning: shot.positioning || "",
    lighting: shot.lighting || "",
    fx: shot.fx || shot.characteristics || shot.special_effects || "",
    sfx: shot.sfx || "",
    music: "无",
  };
}
