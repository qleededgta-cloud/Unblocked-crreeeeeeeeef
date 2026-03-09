import React, { useState, useEffect } from 'react';
import { Gamepad2, Plus, Trash2, Lock, LogOut, Play, X, Info, Wand2, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI, Type } from "@google/genai";

interface Game {
  id: number;
  title: string;
  url: string;
  thumbnail: string;
  description: string;
}

export default function App() {
  const [games, setGames] = useState<Game[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [password, setPassword] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedGame, setSelectedGame] = useState<Game | null>(null);
  const [loading, setLoading] = useState(true);
  const [isScraping, setIsScraping] = useState(false);
  const [scrapeUrl, setScrapeUrl] = useState('');

  // Form state
  const [newGame, setNewGame] = useState({
    title: '',
    url: '',
    thumbnail: '',
    description: ''
  });

  useEffect(() => {
    fetchGames();

    // WebSocket for real-time updates
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    const ws = new WebSocket(wsUrl);

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'GAME_ADDED') {
        setGames(prev => {
          if (prev.some(g => g.id === data.game.id)) return prev;
          return [data.game, ...prev];
        });
      } else if (data.type === 'GAME_DELETED') {
        setGames(prev => prev.filter(g => g.id !== data.id));
      }
    };

    return () => ws.close();
  }, []);

  const fetchGames = async () => {
    try {
      const response = await fetch('/api/games');
      const data = await response.json();
      setGames(data);
    } catch (error) {
      console.error('Error fetching games:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === 'bkenn204') {
      setIsAdmin(true);
      setShowLogin(false);
      setPassword('');
    } else {
      alert('Incorrect password');
    }
  };

  const handleAddGame = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await fetch('/api/games', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...newGame, password: 'bkenn204' })
      });
      if (response.ok) {
        fetchGames();
        setShowAddModal(false);
        setNewGame({ title: '', url: '', thumbnail: '', description: '' });
      }
    } catch (error) {
      console.error('Error adding game:', error);
    }
  };

  const handleDeleteGame = async (id: number) => {
    if (!confirm('Are you sure you want to delete this game?')) return;
    try {
      const response = await fetch(`/api/games/${id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: 'bkenn204' })
      });
      if (response.ok) {
        fetchGames();
      }
    } catch (error) {
      console.error('Error deleting game:', error);
    }
  };

  const handleScrape = async () => {
    if (!scrapeUrl) return;
    setIsScraping(true);
    try {
      // 1. Fetch HTML via proxy
      const proxyRes = await fetch(`/api/proxy-fetch?url=${encodeURIComponent(scrapeUrl)}`);
      if (!proxyRes.ok) throw new Error('Failed to fetch page content');
      const html = await proxyRes.text();

      // 2. Use Gemini to extract metadata
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Extract the game title, a short description, and a thumbnail image URL from this HTML content of a game page. Return only JSON.
        
        HTML Content (truncated):
        ${html.substring(0, 15000)}`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              description: { type: Type.STRING },
              thumbnail: { type: Type.STRING },
            },
            required: ["title", "description", "thumbnail"],
          },
        },
      });

      const result = JSON.parse(response.text || '{}');
      
      setNewGame({
        title: result.title || '',
        url: scrapeUrl,
        thumbnail: result.thumbnail || '',
        description: result.description || ''
      });
      setScrapeUrl('');
    } catch (error) {
      console.error('Scraping error:', error);
      alert('Failed to extract game info. Please fill it manually.');
    } finally {
      setIsScraping(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans">
      {/* Header */}
      <header className="border-b border-white/10 bg-zinc-900/50 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <Gamepad2 className="text-white w-6 h-6" />
            </div>
            <h1 className="text-xl font-bold tracking-tight">Unblocked<span className="text-emerald-500">Games</span></h1>
          </div>

          <div className="flex items-center gap-4">
            {isAdmin ? (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowAddModal(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg font-medium transition-colors"
                >
                  <Plus size={18} />
                  Add Game
                </button>
                <button
                  onClick={() => setIsAdmin(false)}
                  className="p-2 text-zinc-400 hover:text-white transition-colors"
                  title="Logout"
                >
                  <LogOut size={20} />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowLogin(true)}
                className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 rounded-lg font-medium transition-colors border border-white/5"
              >
                <Lock size={16} />
                Admin
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-emerald-500"></div>
          </div>
        ) : games.length === 0 ? (
          <div className="text-center py-20">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-zinc-900 mb-4 border border-white/5">
              <Gamepad2 className="text-zinc-600 w-10 h-10" />
            </div>
            <h2 className="text-2xl font-semibold text-zinc-400">No games found</h2>
            <p className="text-zinc-500 mt-2">Add some games from the admin panel to get started.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {games.map((game) => (
              <motion.div
                key={game.id}
                layoutId={`game-${game.id}`}
                className="group relative bg-zinc-900 rounded-2xl overflow-hidden border border-white/5 hover:border-emerald-500/50 transition-all shadow-xl"
              >
                <div className="aspect-video relative overflow-hidden">
                  <img
                    src={game.thumbnail || `https://picsum.photos/seed/${game.id}/400/225`}
                    alt={game.title}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                    referrerPolicy="no-referrer"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-transparent to-transparent opacity-60" />
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => setSelectedGame(game)}
                      className="w-12 h-12 bg-emerald-500 rounded-full flex items-center justify-center shadow-lg transform scale-90 group-hover:scale-100 transition-transform"
                    >
                      <Play className="text-white fill-current ml-1" size={24} />
                    </button>
                  </div>
                </div>
                
                <div className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-bold text-lg leading-tight">{game.title}</h3>
                    {isAdmin && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteGame(game.id);
                        }}
                        className="p-1.5 text-zinc-500 hover:text-red-500 transition-colors"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                  <p className="text-zinc-500 text-sm mt-1 line-clamp-2">{game.description || 'No description available.'}</p>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </main>

      {/* Game Player Modal */}
      <AnimatePresence>
        {selectedGame && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/90 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="w-full max-w-5xl bg-zinc-900 rounded-3xl overflow-hidden shadow-2xl border border-white/10 flex flex-col h-[85vh]"
            >
              <div className="p-4 border-b border-white/5 flex items-center justify-between bg-zinc-900">
                <div className="flex items-center gap-3">
                  <h2 className="text-xl font-bold">{selectedGame.title}</h2>
                </div>
                <button
                  onClick={() => setSelectedGame(null)}
                  className="p-2 hover:bg-white/5 rounded-full transition-colors"
                >
                  <X size={24} />
                </button>
              </div>
              <div className="flex-1 bg-black relative">
                <iframe
                  src={selectedGame.url}
                  className="w-full h-full border-0"
                  allowFullScreen
                  title={selectedGame.title}
                />
              </div>
              <div className="p-4 bg-zinc-900/50 text-zinc-400 text-sm flex items-center gap-2">
                <Info size={16} className="text-emerald-500" />
                <span>If the game doesn't load, it might be blocked by your network.</span>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Login Modal */}
      <AnimatePresence>
        {showLogin && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/80 backdrop-blur-sm"
          >
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 20, opacity: 0 }}
              className="w-full max-w-md bg-zinc-900 rounded-2xl p-8 shadow-2xl border border-white/10"
            >
              <div className="flex flex-col items-center mb-6">
                <div className="w-16 h-16 bg-zinc-800 rounded-2xl flex items-center justify-center mb-4 border border-white/5">
                  <Lock className="text-emerald-500 w-8 h-8" />
                </div>
                <h2 className="text-2xl font-bold">Admin Access</h2>
                <p className="text-zinc-500 text-sm mt-1">Enter password to manage games</p>
              </div>
              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Password"
                    autoFocus
                    className="w-full bg-zinc-800 border border-white/5 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all"
                  />
                </div>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setShowLogin(false)}
                    className="flex-1 px-4 py-3 bg-zinc-800 hover:bg-zinc-700 rounded-xl font-medium transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 px-4 py-3 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl font-medium transition-colors shadow-lg shadow-emerald-500/20"
                  >
                    Login
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Add Game Modal */}
      <AnimatePresence>
        {showAddModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/80 backdrop-blur-sm"
          >
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 20, opacity: 0 }}
              className="w-full max-w-lg bg-zinc-900 rounded-2xl p-8 shadow-2xl border border-white/10"
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold">Add New Game</h2>
                <button onClick={() => setShowAddModal(false)} className="text-zinc-500 hover:text-white">
                  <X size={24} />
                </button>
              </div>

              {/* Easy Add Section */}
              <div className="mb-8 p-4 bg-emerald-500/5 border border-emerald-500/20 rounded-xl">
                <label className="text-sm font-bold text-emerald-500 mb-2 block uppercase tracking-wider">Easy Add (Auto-fill)</label>
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={scrapeUrl}
                    onChange={(e) => setScrapeUrl(e.target.value)}
                    placeholder="Paste game page URL here..."
                    className="flex-1 bg-zinc-800 border border-white/5 rounded-xl px-4 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all text-sm"
                  />
                  <button
                    type="button"
                    onClick={handleScrape}
                    disabled={isScraping || !scrapeUrl}
                    className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl font-medium transition-all flex items-center gap-2 shadow-lg shadow-emerald-500/20"
                  >
                    {isScraping ? <Loader2 className="animate-spin" size={18} /> : <Wand2 size={18} />}
                    {isScraping ? 'Magic...' : 'Magic Fill'}
                  </button>
                </div>
                <p className="text-[10px] text-zinc-500 mt-2 italic">We'll use AI to grab the title, description, and image for you!</p>
              </div>

              <div className="h-px bg-white/5 mb-6" />

              <form onSubmit={handleAddGame} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-zinc-400">Game Title</label>
                  <input
                    required
                    type="text"
                    value={newGame.title}
                    onChange={(e) => setNewGame({ ...newGame, title: e.target.value })}
                    placeholder="e.g. Super Mario"
                    className="w-full bg-zinc-800 border border-white/5 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-zinc-400">Game URL (Iframe Source)</label>
                  <input
                    required
                    type="url"
                    value={newGame.url}
                    onChange={(e) => setNewGame({ ...newGame, url: e.target.value })}
                    placeholder="https://example.com/game"
                    className="w-full bg-zinc-800 border border-white/5 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-zinc-400">Thumbnail URL (Optional)</label>
                  <input
                    type="url"
                    value={newGame.thumbnail}
                    onChange={(e) => setNewGame({ ...newGame, thumbnail: e.target.value })}
                    placeholder="https://example.com/image.jpg"
                    className="w-full bg-zinc-800 border border-white/5 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-zinc-400">Description</label>
                  <textarea
                    value={newGame.description}
                    onChange={(e) => setNewGame({ ...newGame, description: e.target.value })}
                    placeholder="Briefly describe the game..."
                    rows={3}
                    className="w-full bg-zinc-800 border border-white/5 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all resize-none"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full px-4 py-4 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl font-bold transition-colors shadow-lg shadow-emerald-500/20 mt-4"
                >
                  Publish Game
                </button>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
