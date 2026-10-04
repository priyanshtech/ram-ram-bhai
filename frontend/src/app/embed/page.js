'use client';
import { useState } from 'react';
import { Code2, Copy, Check, ExternalLink, Sparkles } from 'lucide-react';

export default function EmbedConfigPage() {
  const [copied, setCopied] = useState(false);
  const [position, setPosition] = useState('bottom-right');
  const botId = 'bot_demo_987654321';

  const scriptTag = `<script 
  src="http://localhost:3000/widget.js" 
  data-bot-id="${botId}" 
  data-position="${position}" 
  async>
</script>`;

  const handleCopy = () => {
    navigator.clipboard.writeText(scriptTag);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Widget & Website Embed Code</h1>
        <p className="text-slate-400 text-sm mt-1">
          Copy and paste one single JavaScript script tag before the closing <code className="text-indigo-400 font-mono">&lt;/body&gt;</code> tag on your website. No developer required.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Code Generator & Instructions */}
        <div className="lg:col-span-2 space-y-6">
          <div className="glass-panel p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h2 className="font-bold text-white text-base flex items-center gap-2">
                <Code2 className="w-5 h-5 text-indigo-400" />
                1-Line Embed Script Tag
              </h2>

              <button
                onClick={handleCopy}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs transition shadow-md shadow-indigo-600/30 flex items-center gap-2"
              >
                {copied ? <Check className="w-4 h-4 text-emerald-300" /> : <Copy className="w-4 h-4" />}
                {copied ? 'Copied to Clipboard!' : 'Copy Script Tag'}
              </button>
            </div>

            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 font-mono text-xs text-indigo-300 overflow-x-auto select-all leading-relaxed">
              {scriptTag}
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-300">Widget Position on Website</label>
              <div className="flex gap-4">
                <button
                  onClick={() => setPosition('bottom-right')}
                  className={`px-4 py-2 rounded-xl text-xs font-medium border transition ${
                    position === 'bottom-right'
                      ? 'bg-indigo-600/20 text-indigo-400 border-indigo-500'
                      : 'bg-slate-800/40 text-slate-400 border-slate-700'
                  }`}
                >
                  Bottom Right Corner
                </button>
                <button
                  onClick={() => setPosition('bottom-left')}
                  className={`px-4 py-2 rounded-xl text-xs font-medium border transition ${
                    position === 'bottom-left'
                      ? 'bg-indigo-600/20 text-indigo-400 border-indigo-500'
                      : 'bg-slate-800/40 text-slate-400 border-slate-700'
                  }`}
                >
                  Bottom Left Corner
                </button>
              </div>
            </div>
          </div>

          {/* Installation Steps Card */}
          <div className="glass-panel p-6 space-y-4">
            <h3 className="font-bold text-white text-sm">Integration Guide for Common Platforms</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="p-3.5 rounded-xl bg-slate-800/60 border border-slate-700/50 space-y-1">
                <p className="font-bold text-white">WordPress / WooCommerce</p>
                <p className="text-slate-400">Paste code into 'Insert Headers and Footers' plugin or theme header.php.</p>
              </div>
              <div className="p-3.5 rounded-xl bg-slate-800/60 border border-slate-700/50 space-y-1">
                <p className="font-bold text-white">Shopify / Custom HTML</p>
                <p className="text-slate-400">Go to Online Store &gt; Themes &gt; Edit Code &gt; theme.liquid before &lt;/body&gt;.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Live Widget Test Preview */}
        <div className="glass-panel p-6 space-y-4 flex flex-col justify-between">
          <div>
            <h3 className="font-bold text-white text-base mb-2">Test Direct Hosted Link</h3>
            <p className="text-xs text-slate-400 mb-4">
              You can also open the iframe chat interface directly in your browser:
            </p>
            <a
              href={`/embed/${botId}`}
              target="_blank"
              rel="noreferrer"
              className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-indigo-400 font-medium text-xs border border-slate-700 text-center transition flex items-center justify-center gap-2"
            >
              Open Standalone Chat Widget <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>

          <div className="p-4 rounded-xl bg-indigo-950/30 border border-indigo-500/20 text-xs text-indigo-200 space-y-2">
            <div className="flex items-center gap-2 font-bold text-indigo-300">
              <Sparkles className="w-4 h-4" /> Zero Dependencies
            </div>
            <p className="leading-relaxed">
              The loader script is under 3 KB and will never slow down your customer website's Google PageSpeed score.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
