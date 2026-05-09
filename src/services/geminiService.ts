import { GoogleGenAI, Type, InlineDataPart } from "@google/genai";
import { ApiConfig, AnimeShot, UploadedImage } from "../types";

export async function generateAnimeScript(input: string, config: ApiConfig, images: UploadedImage[] = []): Promise<AnimeShot[]> {
  const imageNames = images.map(img => img.name).join(", ");
  const prompt = `你是一位世界级的动漫导演和分镜规划师。
请将以下输入转换成专业的、电影级的动漫脚本，包含顶级的CG级镜头。

输入内容: "${input}"
${images.length > 0 ? `参考图片列表: ${imageNames}` : ""}

要求:
1. 生成至少 5-8 个详细镜头。
2. 确保 "global_style" 针对高质量生成进行了优化（例如 "masterpiece, best quality, ultra-detailed, anime style, cinematic lighting"）。该字段请保持英文。
3. **除了 global_style 之外，所有其他字段必须使用中文编写。**
4. 如果输入中涉及到参考图片中的角色或场景，请在 "description" 或 "action" 字段中使用 "@图片名字" 的格式进行标注（例如：@小明 正在奔跑）。
5. 运镜字段必须包含景别（如：特写、中景、远景、俯拍、仰拍）以及动态运镜描述（如：推镜头、拉镜头、摇镜头、移镜头、环绕镜头等）。
6. 输出必须是一个镜头 JSON 数组。

每个镜头的字段说明：
- global_style (全局风格与画质基地：即分镜图提示词 Storyboard prompt，请使用英文描述，针对高质量图像生成优化)
- duration (时长，例如 "1.5s", "3s")
- camera_movement (运镜：必须包含景别描述，以及推拉摇移、环绕、倒放、快进等专业的运镜描述)
- description (画面描述：视觉效果、环境细节、CG级精度。若涉及参考图请用@标注)
- action (动作：角色移动、细微表情、肢体冲突。若涉及参考图请用@标注)
- positioning (站位描述：角色在画面中的相对位置)
- lighting (光影逻辑：光轴方向、色温、阴影强度、丁达尔效应等)
- fx (顶级特效拆解：粒子、流体、爆破效果、能量流动)
- sfx (音效描述：环境音、打击感)
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
  const imageNames = images.map(img => img.name).join(", ");
  const prompt = `You are a world-class anime director. I have a script with ${fullScript.length} shots. 
I need you to REGENERATE Shot #${targetIndex + 1} based on a specific instruction, while keeping it consistent with the previous and next shots.

Full Script Context:
${fullScript.map((s, i) => `Shot ${i + 1}: ${s.description}`).join("\n")}

Target Shot current content:
${JSON.stringify(fullScript[targetIndex], null, 2)}

Instruction for regeneration: "${instruction}"
${images.length > 0 ? `Reference images: ${imageNames}` : ""}

Constraints:
1. Return ONLY the JSON object for the regenerated Shot #${targetIndex + 1}.
2. Ensure high-end CG level descriptions.
3. Keep the overall flow consistent.
4. global_style must be in English.
5. All other fields must be in Chinese.
6. Use "@image_name" to reference specific characters or environments from the uploaded images.
7. camera_movement MUST include shot scale (景别).

Required JSON fields:
- global_style (全局风格与画质基地: Storyboard prompt in English)
- duration
- camera_movement (MUST include shot scale)
- description (Reference images with @)
- action (Reference images with @)
- positioning
- lighting
- fx
- sfx
- music (always "无")
`;

  if (config.provider === 'google') {
    return callGoogleGemini(prompt, config, false, images);
  } else {
    return callOpenAICompatible(prompt, config, false, images);
  }
}

async function callGoogleGemini(prompt: string, config: ApiConfig, isArray: boolean, images: UploadedImage[] = []): Promise<any> {
  const client = new GoogleGenAI({ apiKey: config.apiKey });
  const modelId = config.model || "gemini-1.5-flash";

  const imageParts: InlineDataPart[] = images.map(img => ({
    inlineData: {
      data: img.base64.split(",")[1], // Remove mime type prefix
      mimeType: img.type
    }
  }));

  const response = await client.models.generateContent({
    model: modelId,
    contents: [
      { role: "user", parts: [{ text: prompt }, ...imageParts] }
    ],
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
        // response_format is often not supported by various proxies, better to rely on prompt
      })
    });

    if (!response.ok) {
      let errText = '';
      try {
        const errorJson = await response.json();
        errText = errorJson.error?.message || errorJson.error || JSON.stringify(errorJson);
      } catch {
        errText = await response.text();
      }
      
      console.error(`[AI Error] ${response.status}: ${errText}`);
      throw new Error(errText || `HTTP ${response.status}`);
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
