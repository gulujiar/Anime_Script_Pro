/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { 
  Sparkles, 
  Send, 
  Loader2, 
  Copy, 
  Trash2, 
  Film, 
  Camera, 
  Music, 
  Volume2, 
  User, 
  ArrowRightLeft,
  Download,
  CheckCircle2,
  Settings,
  X,
  Globe,
  History,
  Clock,
  Image as ImageIcon,
  Upload,
  RotateCcw
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { generateAnimeScript, regenerateShot } from './services/geminiService';
import { ApiConfig, AnimeShot, ProviderType, HistoryItem, UploadedImage } from './types';

const STORAGE_KEY = 'anime_script_pro_config';
const INPUT_STORAGE_KEY = 'anime_script_pro_input';
const SCRIPT_STORAGE_KEY = 'anime_script_pro_script';
const HISTORY_STORAGE_KEY = 'anime_script_pro_history';
const IMAGES_STORAGE_KEY = 'anime_script_pro_images';

const DEFAULT_CONFIG: ApiConfig = {
  provider: 'google',
  apiKey: '',
  model: 'gemini-3-flash-preview',
};

export default function App() {
  const [input, setInput] = useState(() => localStorage.getItem(INPUT_STORAGE_KEY) || '');
  const [loading, setLoading] = useState(false);
  const [script, setScript] = useState<AnimeShot[] | null>(() => {
    const saved = localStorage.getItem(SCRIPT_STORAGE_KEY);
    try {
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [copied, setCopied] = useState(false);
  const [shotCopiedIndex, setShotCopiedIndex] = useState<number | null>(null);
  const [regenModal, setRegenModal] = useState<{ index: number; instruction: string } | null>(null);
  const [regenLoading, setRegenLoading] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [config, setConfig] = useState<ApiConfig>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : DEFAULT_CONFIG;
  });
  const [history, setHistory] = useState<HistoryItem[]>(() => {
    const saved = localStorage.getItem(HISTORY_STORAGE_KEY);
    try {
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [errorToast, setErrorToast] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);
  const [uploadedImages, setUploadedImages] = useState<UploadedImage[]>(() => {
    const saved = localStorage.getItem(IMAGES_STORAGE_KEY);
    try {
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Auto-save images to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(IMAGES_STORAGE_KEY, JSON.stringify(uploadedImages));
    } catch (e) {
      console.warn("localStorage quota exceeded while auto-saving images");
    }
  }, [uploadedImages]);

  // Ctrl+S Keyboard Shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        try {
          localStorage.setItem(INPUT_STORAGE_KEY, input);
          if (script) {
            localStorage.setItem(SCRIPT_STORAGE_KEY, JSON.stringify(script));
          }
          localStorage.setItem(IMAGES_STORAGE_KEY, JSON.stringify(uploadedImages));
          
          setSuccessToast("内容已保存至浏览器缓存");
          setTimeout(() => setSuccessToast(null), 2000);
        } catch (e) {
          setErrorToast("保存失败：浏览器缓存空间已满");
          setTimeout(() => setErrorToast(null), 3000);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [input, script, uploadedImages]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    Array.from(files).forEach((file: File) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        setUploadedImages(prev => [
          ...prev,
          {
            id: Math.random().toString(36).substring(7) + Date.now(),
            name: file.name,
            base64: reader.result as string,
            type: file.type
          }
        ]);
      };
      reader.readAsDataURL(file);
    });
  };

  const removeImage = (id: string) => {
    setUploadedImages(prev => prev.filter(img => img.id !== id));
  };

  const saveConfig = (newConfig: ApiConfig) => {
    setConfig(newConfig);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newConfig));
    } catch (e) {
      console.error("Failed to save config to localStorage");
    }
  };

  const handleGenerate = async () => {
    if (!input.trim()) return;
    if (!config.apiKey && config.provider !== 'google') {
       setShowSettings(true);
       return;
    }
    setLoading(true);
    // Sync input to storage
    try {
      localStorage.setItem(INPUT_STORAGE_KEY, input);
    } catch (e) {}

    try {
      const result = await generateAnimeScript(input, config, uploadedImages);
      setScript(result);
      try {
        localStorage.setItem(SCRIPT_STORAGE_KEY, JSON.stringify(result));
      } catch (e) {}
      
      // Add to history
      const newItem: HistoryItem = {
        id: Math.random().toString(36).substring(2, 9) + Date.now().toString(),
        input,
        script: result,
        uploadedImages: [...uploadedImages],
        timestamp: Date.now(),
      };
      // Limit history to 50 items
      const newHistory = [newItem, ...history.slice(0, 49)];
      setHistory(newHistory);
      try {
        localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(newHistory));
      } catch (e) {
        console.warn("History storage quota exceeded, attempting to prune...");
        // Try saving fewer history items if it fails
        try {
           localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify([newItem, ...history.slice(0, 9)]));
        } catch (e2) {
           try {
             localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify([newItem]));
           } catch (e3) {}
        }
      }
    } catch (error: any) {
      console.error("Generation error:", error);
      const isNetworkError = error.message === 'Failed to fetch' || error.message?.includes('Network') || error.message === 'TypeError: Failed to fetch';
      setErrorToast(isNetworkError ? "生成失败：未能获取 (请检查 CORS 或网络)" : `生成失败: ${error.message || '未知错误'}`);
      setTimeout(() => setErrorToast(null), 6000);
    } finally {
      setLoading(false);
    }
  };

  const handleRegenerateShot = async () => {
    if (!regenModal || !script) return;
    setRegenLoading(true);
    try {
      const newShot = await regenerateShot(script, regenModal.index, regenModal.instruction, config, uploadedImages);
      const newScript = [...script];
      newScript[regenModal.index] = newShot;
      setScript(newScript);
      try {
        localStorage.setItem(SCRIPT_STORAGE_KEY, JSON.stringify(newScript));
      } catch (e) {}
      setRegenModal(null);
    } catch (error: any) {
      console.error("Regeneration error:", error);
      const isNetworkError = error.message === 'Failed to fetch' || error.message?.includes('Network') || error.message === 'TypeError: Failed to fetch';
      setErrorToast(isNetworkError ? "生成失败：未能获取 (请检查 CORS 或网络)" : `镜头重新生成失败: ${error.message}`);
      setTimeout(() => setErrorToast(null), 6000);
    } finally {
      setRegenLoading(false);
    }
  };

  const copyToClipboard = () => {
    if (!script) return;
    const text = script.map((s, i) => `镜头 ${i + 1}
全局风格与画质基地: ${s.globalStyle}
时长: ${s.duration}
运镜与景别: ${s.cameraMovement}
画面描述: ${s.description}
动作描述: ${s.action}
站位描述: ${s.positioning}
光影逻辑: ${s.lighting}
顶级特效: ${s.fx}
音效描述: ${s.sfx}
对白: ${s.dialogue}
音乐: ${s.music}`).join('\n\n');
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const copyShotToClipboard = (index: number) => {
    if (!script) return;
    const s = script[index];
    const text = `镜头 ${index + 1}
全局风格与画质基地: ${s.globalStyle}
时长: ${s.duration}
运镜与景别: ${s.cameraMovement}
画面描述: ${s.description}
动作描述: ${s.action}
站位描述: ${s.positioning}
光影逻辑: ${s.lighting}
顶级特效: ${s.fx}
音效描述: ${s.sfx}
对白: ${s.dialogue}
音乐: ${s.music}`;

    navigator.clipboard.writeText(text);
    setShotCopiedIndex(index);
    setTimeout(() => setShotCopiedIndex(null), 2000);
  };

  const categories = [
    { label: '全局风格与画质基地', key: 'globalStyle', icon: <Sparkles className="w-4 h-4" /> },
    { label: '时长', key: 'duration', icon: <Loader2 className="w-4 h-4" /> },
    { label: '运镜与景别', key: 'cameraMovement', icon: <Camera className="w-4 h-4" /> },
    { label: '画面描述', key: 'description', icon: <Film className="w-4 h-4" /> },
    { label: '动作描述', key: 'action', icon: <User className="w-4 h-4" /> },
    { label: '站位描述', key: 'positioning', icon: <ArrowRightLeft className="w-4 h-4" /> },
    { label: '光影逻辑', key: 'lighting', icon: <Sparkles className="w-4 h-4" /> },
    { label: '顶级特效拆解', key: 'fx', icon: <Sparkles className="w-4 h-4" /> },
    { label: '音效描述', key: 'sfx', icon: <Volume2 className="w-4 h-4" /> },
    { label: '对白', key: 'dialogue', icon: <Volume2 className="w-4 h-4" /> },
    { label: '音乐（默认,无）', key: 'music', icon: <Music className="w-4 h-4" /> },
  ];

  const handleReturn = () => {
    setScript(null);
    localStorage.removeItem(SCRIPT_STORAGE_KEY);
  };

  const deleteHistoryItem = (id: string) => {
    const newHistory = history.filter(item => item.id !== id);
    setHistory(newHistory);
    try {
      localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(newHistory));
    } catch (e) {}
  };

  const loadHistoryItem = (item: HistoryItem) => {
    setScript(item.script);
    setInput(item.input);
    setUploadedImages(item.uploadedImages || []);
    try {
      localStorage.setItem(SCRIPT_STORAGE_KEY, JSON.stringify(item.script));
      localStorage.setItem(INPUT_STORAGE_KEY, item.input);
      localStorage.setItem(IMAGES_STORAGE_KEY, JSON.stringify(item.uploadedImages || []));
    } catch (e) {}
    // Move it to the top of history
    const filtered = history.filter(h => h.id !== item.id);
    const newHistory = [item, ...filtered];
    setHistory(newHistory);
    try {
      localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(newHistory));
    } catch (e) {}
  };

  const fillHistoryToInput = (item: HistoryItem) => {
    setInput(item.input);
    setUploadedImages(item.uploadedImages || []);
    try {
      localStorage.setItem(INPUT_STORAGE_KEY, item.input);
      localStorage.setItem(IMAGES_STORAGE_KEY, JSON.stringify(item.uploadedImages || []));
    } catch (e) {}
    setSuccessToast("内容已填充至输入框");
    setTimeout(() => setSuccessToast(null), 2000);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 font-sans selection:bg-orange-500/30">
      {/* Error Toast */}
      <AnimatePresence>
        {errorToast && (
          <motion.div 
            initial={{ opacity: 0, y: -50, scale: 0.9 }}
            animate={{ opacity: 1, y: 30, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="fixed top-0 left-1/2 -translate-x-1/2 z-[100] w-full max-w-sm px-4"
          >
            <div className="bg-red-500/10 border border-red-500/50 backdrop-blur-xl p-4 rounded-2xl flex items-center gap-3 shadow-2xl shadow-red-500/20">
              <div className="bg-red-500 p-2 rounded-xl">
                <X className="w-4 h-4 text-white" />
              </div>
              <p className="text-sm font-bold text-red-500">{errorToast}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Success Toast */}
      <AnimatePresence>
        {successToast && (
          <motion.div 
            initial={{ opacity: 0, y: -50, scale: 0.9 }}
            animate={{ opacity: 1, y: 30, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="fixed top-0 left-1/2 -translate-x-1/2 z-[100] w-full max-w-sm px-4"
          >
            <div className="bg-orange-500/10 border border-orange-500/50 backdrop-blur-xl p-4 rounded-2xl flex items-center gap-3 shadow-2xl shadow-orange-500/20">
              <div className="bg-orange-500 p-2 rounded-xl">
                <CheckCircle2 className="w-4 h-4 text-white" />
              </div>
              <p className="text-sm font-bold text-orange-500">{successToast}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Grid Pattern Background */}
      <div className="fixed inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none" />
      
      <main className={`relative max-w-[98%] mx-auto px-2 lg:px-4 transition-all duration-500 ${script ? 'py-4' : 'py-12 md:py-20'}`}>
        {/* Header */}
        <header className={`transition-all duration-500 flex items-center ${script ? 'justify-between mb-4' : 'justify-center relative mb-12 text-center'}`}>
          {!script && (
             <div className="absolute right-4 top-0 flex items-center gap-4">
                <div className="hidden sm:flex flex-col items-end">
                  <span className="text-[10px] font-black uppercase tracking-widest text-neutral-500">Current AI</span>
                  <span className="text-xs font-bold text-orange-500/80">
                    {config.provider === 'google' ? 'Google' : config.provider === 'volcengine' ? '火山引擎' : 'GRS'} / {config.model}
                  </span>
                </div>
                <button 
                  onClick={() => setShowSettings(true)}
                  className="p-2 text-neutral-500 hover:text-orange-500 transition-colors"
                  title="设置 API"
                >
                  <Settings className="w-6 h-6" />
                </button>
             </div>
          )}

          <motion.div
            layout
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <h1 className={`font-black tracking-normal transition-all duration-500 ${script ? 'text-xl' : 'text-5xl md:text-7xl mb-4'}`}>
              <span className="bg-clip-text text-transparent bg-gradient-to-r from-neutral-100 to-neutral-400 mr-3 inline-block">森夏</span>
              <span className="text-orange-500 drop-shadow-[0_0_15px_rgba(249,115,22,0.3)] tracking-wider">故事板</span>
            </h1>
          </motion.div>

          {script && (
             <div className="flex items-center gap-4">
                <div className="hidden sm:flex flex-col items-end">
                  <span className="text-[10px] font-black uppercase tracking-widest text-neutral-500">Active Model</span>
                  <span className="text-xs font-bold text-orange-500/80">
                    {config.provider === 'google' ? 'Google' : config.provider === 'volcengine' ? '火山引擎' : 'GRS'} / {config.model}
                  </span>
                </div>
                <button 
                  onClick={() => setShowSettings(true)}
                  className="p-2 text-neutral-500 hover:text-orange-500 transition-colors"
                  title="设置 API"
                >
                  <Settings className="w-5 h-5" />
                </button>
             </div>
          )}
        </header>

        {/* Input Section - Hidden after generation */}
        <AnimatePresence>
          {!script && (
            <motion.section 
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-16 overflow-hidden"
            >
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-neutral-900/50 border border-neutral-800 rounded-2xl p-6 shadow-2xl backdrop-blur-xl"
              >
                <div className="relative">
                  <textarea
                    value={input}
                    onChange={(e) => {
                      const newVal = e.target.value;
                      setInput(newVal);
                      localStorage.setItem(INPUT_STORAGE_KEY, newVal);
                    }}
                    placeholder="输入剧情或一句话描述（例如：“血月下，武士与赛博巨龙的终极对决”）..."
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl p-4 text-neutral-200 placeholder:text-neutral-600 focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500/50 transition-all min-h-[120px] resize-none text-sm leading-relaxed"
                  />

                  {/* Image Upload Area */}
                  <div className="mt-4">
                    <div className="flex flex-wrap gap-3">
                      <AnimatePresence>
                        {uploadedImages.map((img) => (
                          <motion.div 
                            key={img.id}
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.8 }}
                            className="group relative w-16 h-16 rounded-xl border border-neutral-800 overflow-hidden bg-neutral-900"
                          >
                            <img src={img.base64} alt={img.name} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" />
                            <div className="absolute inset-x-0 bottom-0 bg-neutral-950/80 p-0.5 pointer-events-none">
                              <p className="text-[8px] text-center text-neutral-400 truncate px-1">{img.name}</p>
                            </div>
                            <button 
                              onClick={() => removeImage(img.id)}
                              className="absolute inset-0 bg-red-500/80 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-all"
                            >
                              <Trash2 className="w-4 h-4 text-white" />
                            </button>
                          </motion.div>
                        ))}
                      </AnimatePresence>
                      
                      <label className="w-16 h-16 rounded-xl border-2 border-dashed border-neutral-800 flex flex-col items-center justify-center hover:border-orange-500/50 hover:bg-orange-500/5 cursor-pointer transition-all gap-1">
                        <input 
                          type="file" 
                          multiple 
                          accept="image/*" 
                          className="hidden" 
                          onChange={handleImageUpload}
                        />
                        <Upload className="w-4 h-4 text-neutral-600" />
                        <span className="text-[8px] font-bold text-neutral-600">添加图片</span>
                      </label>
                    </div>
                  </div>

                  <div className="absolute bottom-4 right-4 flex gap-2">
                    {input && (
                      <button 
                        onClick={() => {
                          setInput('');
                          localStorage.removeItem(INPUT_STORAGE_KEY);
                        }}
                        className="p-2 text-neutral-500 hover:text-red-400 transition-colors"
                        title="清空输入"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    )}
                    <button
                      onClick={handleGenerate}
                      disabled={loading || !input.trim()}
                      className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 disabled:bg-neutral-800 disabled:text-neutral-600 text-white font-bold py-2 px-6 rounded-lg transition-all shadow-lg shadow-orange-500/20 active:scale-95 text-sm uppercase tracking-wider"
                    >
                      {loading ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          生成中...
                        </>
                      ) : (
                        <>
                          <Send className="w-4 h-4" />
                          开始生成
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </motion.div>

              {/* History Section */}
              {history.length > 0 && (
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-8"
                >
                  <div className="flex items-center gap-2 mb-4 text-neutral-500">
                    <History className="w-4 h-4" />
                    <h3 className="text-xs font-black uppercase tracking-widest">生成记录</h3>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {history.map((item) => (
                      <motion.div
                        key={item.id}
                        layout
                        className="group relative bg-neutral-900/30 border border-neutral-800/50 rounded-xl p-4 hover:border-orange-500/30 transition-all cursor-pointer backdrop-blur-sm"
                        onClick={() => loadHistoryItem(item)}
                      >
                        <div className="flex justify-between items-start mb-2">
                          <div className="flex items-center gap-1.5 text-[10px] text-neutral-500 font-mono">
                            <Clock className="w-3 h-3" />
                            {new Date(item.timestamp).toLocaleString('zh-CN', { 
                              month: 'numeric', 
                              day: 'numeric', 
                              hour: '2-digit', 
                              minute: '2-digit' 
                            })}
                          </div>
                          <div className="flex items-center gap-1">
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                fillHistoryToInput(item);
                              }}
                              className="opacity-0 group-hover:opacity-100 p-1 text-neutral-600 hover:text-orange-400 transition-all"
                              title="填充此条内容"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                            </button>
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteHistoryItem(item.id);
                              }}
                              className="opacity-0 group-hover:opacity-100 p-1 text-neutral-600 hover:text-red-400 transition-all"
                              title="删除记录"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                        <p className="text-xs text-neutral-400 line-clamp-2 leading-relaxed">
                          {item.input}
                        </p>
                        <div className="mt-3 flex items-center justify-between text-[10px] font-bold text-neutral-600">
                          <span className="bg-neutral-950 px-2 py-0.5 rounded border border-neutral-800">
                            {item.script.length} 个镜头
                          </span>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </motion.div>
              )}
            </motion.section>
          )}
        </AnimatePresence>

        {/* Results Section */}
        <AnimatePresence mode="wait">
          {script && (
            <motion.section
              key="results"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -30 }}
              className="relative"
            >
              {/* Top Left Return Button */}
              <div className="mb-4">
                <button
                  onClick={handleReturn}
                  className="flex items-center gap-2 bg-neutral-900/50 hover:bg-neutral-800 text-neutral-400 py-2 px-4 rounded-lg text-xs transition-colors border border-neutral-800 active:scale-95 shadow-sm"
                >
                  <ArrowRightLeft className="w-3 h-3" />
                  返回
                </button>
              </div>

              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                <h3 className="text-xl font-bold uppercase italic tracking-wider flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-orange-500" />
                  生成脚本内容
                </h3>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={copyToClipboard}
                    className="flex items-center gap-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 py-2 px-4 rounded-lg text-xs transition-colors border border-neutral-700 active:scale-95"
                  >
                    {copied ? (
                      <>
                        <CheckCircle2 className="w-3 h-3 text-green-500" />
                        已复制！
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" />
                        复制全部
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* 横向滚动表格 (Excel 风格) */}
              <div className="mt-6 relative border border-neutral-800 rounded-xl overflow-hidden bg-neutral-900/30">
                <div 
                  ref={scrollContainerRef}
                  className="overflow-x-auto scrollbar-thin scrollbar-thumb-neutral-800 scrollbar-track-transparent"
                >
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="bg-neutral-950">
                        <th className="sticky left-0 z-20 bg-neutral-950 border-r border-b border-neutral-800 p-4 text-xs font-black uppercase tracking-widest text-neutral-500 w-[150px] min-w-[150px] text-left">
                          类别 / 镜头
                        </th>
                        {script.map((_, index) => (
                          <th 
                            key={index} 
                            className="border-r border-b border-neutral-800 p-4 min-w-[350px] bg-neutral-950/50 group relative"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs font-black uppercase tracking-widest text-orange-500/80">镜头 {index + 1}</span>
                              <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button 
                                  onClick={() => copyShotToClipboard(index)}
                                  className={`p-2 rounded-lg border transition-all active:scale-90 shadow-lg ${
                                    shotCopiedIndex === index 
                                      ? 'bg-green-500/20 border-green-500/50 text-green-400' 
                                      : 'bg-neutral-900 border-neutral-800 text-neutral-400 hover:text-orange-400 hover:border-orange-500/30'
                                  }`}
                                  title="复制此镜头"
                                >
                                  {shotCopiedIndex === index ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                                </button>
                                <button 
                                  onClick={() => setRegenModal({ index, instruction: '' })}
                                  className="p-2 rounded-lg bg-neutral-900 border border-neutral-800 text-neutral-400 hover:text-orange-400 hover:border-orange-500/30 transition-all active:scale-90 shadow-lg"
                                  title="重新生成"
                                >
                                  <Sparkles className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                            <div className="absolute inset-x-0 bottom-0 h-0.5 bg-orange-500/50 scale-x-0 group-hover:scale-x-100 transition-transform origin-left" />
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {categories.map((cat) => (
                        <tr key={cat.key} className="group hover:bg-neutral-800/30 transition-colors">
                          <td className="sticky left-0 z-10 bg-neutral-900/90 backdrop-blur-md border-r border-b border-neutral-800 p-4 text-sm font-bold text-neutral-400 group-hover:text-orange-400 transition-colors uppercase tracking-tight align-middle">
                            <div className="flex items-center justify-between gap-2">
                              {cat.label}
                              <span className="opacity-20 group-hover:opacity-100 transition-opacity">
                                {cat.icon}
                              </span>
                            </div>
                          </td>
                          {script.map((shot, sIndex) => (
                            <td key={sIndex} className="border-r border-b border-neutral-800 p-0 align-top min-w-[350px]">
                              <textarea
                                value={String(shot[cat.key as keyof AnimeShot] || '')}
                                onChange={(e) => {
                                  const newScript = [...script];
                                  newScript[sIndex] = { ...newScript[sIndex], [cat.key]: e.target.value };
                                  setScript(newScript);
                                }}
                                className="w-full h-full min-h-[120px] p-4 bg-transparent border-none text-xs leading-relaxed text-neutral-300 focus:outline-none focus:ring-1 focus:ring-orange-500/30 resize-none scrollbar-none"
                                placeholder="..."
                              />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

            </motion.section>
          )}

          {!script && !loading && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center py-20 text-neutral-700"
            >
              <Film className="w-16 h-16 mb-4 opacity-20" />
              <p className="text-sm uppercase tracking-[0.2em] font-medium italic">准备就绪</p>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Settings Modal */}
      <AnimatePresence>
        {showSettings && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowSettings(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-md"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-lg bg-neutral-900 border border-neutral-800 rounded-2xl p-8 shadow-2xl flex flex-col gap-6"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-bold text-neutral-100 flex items-center gap-2">
                  <Settings className="w-5 h-5 text-orange-500" />
                  API 配置
                </h3>
                <button 
                  onClick={() => setShowSettings(false)}
                  className="p-2 text-neutral-500 hover:text-neutral-200 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-black uppercase tracking-widest text-neutral-500 mb-2">服务商</label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: 'google', label: 'Google', icon: <Sparkles className="w-3 h-3"/> },
                      { id: 'volcengine', label: '火山引擎', icon: <Globe className="w-3 h-3"/> },
                      { id: 'grsai', label: 'GRS Gemini', icon: <Sparkles className="w-3 h-3"/> }
                    ].map((p) => (
                      <button
                        key={p.id}
                        onClick={() => saveConfig({ 
                          ...config, 
                          provider: p.id as ProviderType,
                          model: p.id === 'google' ? 'gemini-1.5-flash' : (p.id === 'grsai' ? 'gemini-1.5-pro' : config.model),
                          baseUrl: p.id === 'volcengine' ? 'https://ark.cn-beijing.volces.com/api/v3' : (p.id === 'grsai' ? 'https://grsaiapi.com/v1' : '')
                        })}
                        className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg border text-xs font-bold transition-all ${
                          config.provider === p.id 
                            ? 'bg-orange-500 border-orange-500 text-white shadow-lg shadow-orange-500/20' 
                            : 'bg-neutral-950 border-neutral-800 text-neutral-500 hover:border-neutral-700'
                        }`}
                      >
                        {p.icon}
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-black uppercase tracking-widest text-neutral-500 mb-2">API KEY</label>
                  <input
                    type="password"
                    value={config.apiKey}
                    onChange={(e) => saveConfig({ ...config, apiKey: e.target.value })}
                    placeholder="输入您的 API Key..."
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl p-3 text-sm text-neutral-200 focus:outline-none focus:ring-2 focus:ring-orange-500/50"
                  />
                </div>

                <div>
                  <label className="block text-xs font-black uppercase tracking-widest text-neutral-500 mb-2">模型名称 / Endpoint ID</label>
                  <input
                    type="text"
                    value={config.model}
                    onChange={(e) => saveConfig({ ...config, model: e.target.value })}
                    placeholder="例如: gemini-1.5-flash 或 ep-xxx"
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl p-3 text-sm text-neutral-200 focus:outline-none focus:ring-2 focus:ring-orange-500/50"
                  />
                </div>

                <div>
                  <label className="block text-xs font-black uppercase tracking-widest text-neutral-500 mb-2">接口地址 (可选)</label>
                  <input
                    type="text"
                    value={config.baseUrl || ''}
                    onChange={(e) => saveConfig({ ...config, baseUrl: e.target.value })}
                    placeholder="https://..."
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl p-3 text-sm text-neutral-200 focus:outline-none focus:ring-2 focus:ring-orange-500/50"
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-neutral-800">
                <button
                  onClick={() => setShowSettings(false)}
                  className="w-full bg-neutral-800 hover:bg-neutral-700 text-neutral-200 font-bold py-3 rounded-xl transition-all"
                >
                  保存并关闭
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Regeneration Modal */}
      <AnimatePresence>
        {regenModal !== null && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => !regenLoading && setRegenModal(null)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-lg bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-2xl"
            >
              <h3 className="text-xl font-bold text-neutral-100 mb-2 flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-orange-500" />
                重新生成镜头 {regenModal.index + 1}
              </h3>
              <p className="text-neutral-400 text-sm mb-4">
                输入您的具体修改要求，我们将根据上下文为您重新设计该镜头。
              </p>
              
              <textarea
                autoFocus
                value={regenModal.instruction}
                onChange={(e) => setRegenModal({ ...regenModal, instruction: e.target.value })}
                placeholder="例如：让场景更具史诗感，增加更多的雷暴特效..."
                className="w-full bg-neutral-950 border border-neutral-800 rounded-xl p-4 text-neutral-200 placeholder:text-neutral-600 focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500/50 transition-all min-h-[120px] resize-none text-sm mb-6"
              />

              <div className="flex gap-3 justify-end">
                <button
                  disabled={regenLoading}
                  onClick={() => setRegenModal(null)}
                  className="px-6 py-2 rounded-lg text-sm font-bold text-neutral-400 hover:text-neutral-200 transition-colors"
                >
                  取消
                </button>
                <button
                  disabled={regenLoading || !regenModal.instruction.trim()}
                  onClick={handleRegenerateShot}
                  className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 disabled:bg-neutral-800 disabled:text-neutral-600 text-white font-bold py-2 px-8 rounded-lg transition-all shadow-lg shadow-orange-500/20 active:scale-95 text-sm"
                >
                  {regenLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      重新生成中...
                    </>
                  ) : (
                    '确定'
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

