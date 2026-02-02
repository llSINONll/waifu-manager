import { useState, useEffect } from 'react'
import axios from 'axios'
import { motion, AnimatePresence } from 'framer-motion'
import { FaSearch, FaPlus, FaTrash, FaBars, FaTimes, FaHeart, FaCog , FaBell} from 'react-icons/fa'
import toast, { Toaster } from 'react-hot-toast';

// Use the cloud URL if available, otherwise use localhost
axios.defaults.baseURL = import.meta.env.VITE_API_URL || "http://localhost:8000";

function App() {
  // --- STATE VARIABLES ---
  const [query, setQuery] = useState("")
  const [searchResults, setSearchResults] = useState([])
  const [myWaifus, setMyWaifus] = useState([])
  const [loading, setLoading] = useState(false)
  const [isWakingUp, setIsWakingUp] = useState(true)
  const [menuView, setMenuView] = useState("main")

  // --- USER ID LOGIC ---
  const [userId, setUserId] = useState(localStorage.getItem("waifu_user_id") || "")

  useEffect(() => {
    if (!userId) {
      // ANIME STYLE ID GENERATOR
      // 1. Random Prefix (GGO, SAO, ALO, SLF)
      const prefixes = ["GGO", "SAO", "ALO", "SLF", "UNIT"];
      const randomPrefix = prefixes[Math.floor(Math.random() * prefixes.length)];
      
      // 2. Random Tactical Number (e.g., 0492)
      const randomNumber = Math.floor(1000 + Math.random() * 9000);
      
      // 3. Combine: "GGO-4821"
      const newId = `${randomPrefix}-${randomNumber}`;
      
      localStorage.setItem("waifu_user_id", newId);
      setUserId(newId);
    }
  }, [])

  // --- SERVICE WORKER REGISTRATION (Mobile Notifications) ---
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js')
        .then(reg => console.log('Service Worker Registered!', reg))
        .catch(err => console.log('Service Worker Failed', err));
    }
  }, []);
  
  // Menu State
  const [isMenuOpen, setIsMenuOpen] = useState(false)

  // Add Modal State
  const [selectedChar, setSelectedChar] = useState(null)
  const [showModal, setShowModal] = useState(false)
  const [manualDate, setManualDate] = useState({ month: "", day: "" })

  // --- USE EFFECT (Load Data) ---
  useEffect(() => { 
    if(userId) fetchDashboard(); 
  }, [userId])

  // Live Search Logic
  useEffect(() => {
    if (!query) { setSearchResults([]); return; }
    const delayDebounceFn = setTimeout(() => { handleSearch(query); }, 600);
    return () => clearTimeout(delayDebounceFn);
  }, [query])

  // --- FUNCTIONS ---
  
  // --- UPDATED NOTIFICATION SYSTEM ---
  const sendNotification = (title, body) => {
    // 1. In-App Toast (Keep this, it's pretty)
    toast(t => (
      <div className="flex flex-col">
        <span className="font-bold text-md">{title}</span>
        <span className="text-sm text-gray-500">{body}</span>
      </div>
    ), {
      icon: '🔔',
      style: { borderRadius: '10px', background: '#1f2937', color: '#fff', border: '1px solid #ec4899' },
      duration: 4000,
    });

    // 2. SYSTEM STATUS BAR NOTIFICATION (The Android Fix)
    if (Notification.permission === "granted" && 'serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then(registration => {
        registration.showNotification(title, {
          body: body,
          icon: '/logo.png', // Ensure this image exists in public folder
          badge: '/logo.png', // Small icon for the status bar (should be white/transparent ideally)
          vibrate: [200, 100, 200], // Buzz-Pause-Buzz
          tag: 'waifu-notification', // Prevents spamming multiple alerts
          renotify: true // Buzz again even if the notification is the same
        });
      });
    }
  }

  const checkBirthdaysAndNotify = (waifuList) => {
    // 1. Ask for permission if not granted
    if (Notification.permission !== "granted") {
      Notification.requestPermission();
    }

    // 2. Look for birthdays TODAY or TOMORROW
    waifuList.forEach(waifu => {
      if (waifu.days_until === 0) {
        sendNotification(`🎉 It's ${waifu.name}'s Birthday!`, `Don't forget to celebrate today!`);
      } else if (waifu.days_until === 1) {
        sendNotification(`⏰ Heads up!`, `${waifu.name}'s birthday is tomorrow!`);
      }
    });
  }

    // --- NEW FUNCTION ---
  const requestNotificationAccess = () => {
    if (!("Notification" in window)) {
      alert("This browser does not support desktop notifications");
      return;
    }
    Notification.requestPermission().then((permission) => {
      if (permission === "granted") {
        sendNotification("System Online", "Notifications are now active!");
        setIsMenuOpen(false); // Close menu on success
      } else {
        alert("Permission denied. Check phone settings.");
      }
    });
  }

  const fetchDashboard = () => {
    if (!userId) return; // Wait until we have an ID
    axios.get('/dashboard', {
        headers: { 'x-user-id': userId }
      })
      .then(res => {
        setMyWaifus(res.data);
        checkBirthdaysAndNotify(res.data);
        setIsWakingUp(false); // STOP LOADING
      })
      .catch(err => {
        console.error(err);
        setIsWakingUp(false); // STOP LOADING EVEN IF ERROR
      })
  }

  const handleSearch = (searchTerm) => {
    setLoading(true);
    axios.get(`/search/${searchTerm}`)
      .then(res => { setSearchResults(res.data); setLoading(false); })
      .catch(err => { console.log("No results"); setLoading(false); })
  }

  const openAddModal = (character) => {
    setSelectedChar(character);
    setManualDate({ month: "", day: "" }); 
    setShowModal(true);
  }

  const confirmAdd = () => {
    if (!selectedChar) return;
    axios.post('/add', {
      name: selectedChar.name,
      image: selectedChar.image,
      about: selectedChar.about,
      manual_month: manualDate.month ? parseInt(manualDate.month) : null,
      manual_day: manualDate.day ? parseInt(manualDate.day) : null
    }, {
      headers: { 'x-user-id': userId } // THE KEY CARD (Passed as 3rd argument)
    })
    .then(res => {
      alert(res.data.message);
      setShowModal(false);
      setQuery("");
      setSearchResults([]);
      fetchDashboard(); 
    })
    .catch(err => alert("Error adding waifu"))
  }

  const deleteWaifu = (id) => {
    axios.delete(`/delete/${id}`, {
        headers: { 'x-user-id': userId } // THE KEY CARD
      })
      .then(res => { fetchDashboard(); })
      .catch(err => alert("Error deleting"))
  }

  const scrollToSection = (id) => {
    setIsMenuOpen(false);
    const element = document.getElementById(id);
    if (element) { element.scrollIntoView({ behavior: 'smooth' }); }
  }

  // --- RENDER ---
  return (
    <div className="min-h-screen bg-gray-900 text-white font-sans relative overflow-x-hidden">
      <Toaster position="top-center" reverseOrder={false} />
      {/* --- 1. THE HAMBURGER BUTTON --- */}
      <button 
        onClick={() => setIsMenuOpen(true)}
        className="fixed top-6 right-6 z-50 bg-pink-600 hover:bg-pink-500 p-3 rounded-md shadow-lg shadow-pink-500/30 border border-pink-400 transition-all hover:scale-105"
      >
        <FaBars size={24} />
      </button>

      {/* --- 2. THE ANIME MENU OVERLAY --- */}
      <AnimatePresence>
        {isMenuOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 0.5 }} exit={{ opacity: 0 }}
              onClick={() => setIsMenuOpen(false)}
              className="fixed inset-0 bg-black z-40"
            />
            
            <motion.div 
              initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="fixed top-0 right-0 h-full w-80 bg-gray-800 border-l-2 border-pink-500 z-50 p-8 shadow-2xl flex flex-col"
            >
              <div className="flex justify-between items-center mb-10 border-b border-gray-600 pb-4">
                <h2 className="text-2xl font-bold text-pink-500 tracking-wider">SYSTEM MENU</h2>
                <button onClick={() => setIsMenuOpen(false)} className="text-gray-400 hover:text-white">
                  <FaTimes size={24} />
                </button>
              </div>

              {/* --- MENU CONTENT SWITCHER --- */}
              <div className="flex flex-col gap-6">
                {menuView === "main" ? (
                  /* MAIN MENU */
                  <>
                    <button onClick={() => { setIsMenuOpen(false); scrollToSection('search-section'); }} className="flex items-center gap-4 text-xl font-bold text-gray-300 hover:text-pink-400 transition-all">
                      <FaSearch /> SEARCH WAIFUS
                    </button>
                    <button onClick={() => { setIsMenuOpen(false); scrollToSection('dashboard-section'); }} className="flex items-center gap-4 text-xl font-bold text-gray-300 hover:text-pink-400 transition-all">
                      <FaHeart /> MY COLLECTION
                    </button>
                    <button onClick={() => setMenuView("settings")} className="flex items-center gap-4 text-xl font-bold text-gray-300 hover:text-pink-400 transition-all">
                      <FaCog /> SETTINGS
                    </button>
                  </>
                ) : (
                  /* SETTINGS MENU */
                  <>
                    <button onClick={() => setMenuView("main")} className="flex items-center gap-4 text-lg font-bold text-gray-500 hover:text-white mb-4 transition-all">
                      <FaTimes /> BACK
                    </button>
                    
                    <h3 className="text-pink-500 font-bold mb-2 uppercase tracking-widest text-sm">System Config</h3>
                    
                    <button onClick={requestNotificationAccess} className="flex items-center gap-4 text-xl font-bold text-white hover:text-green-400 transition-all p-3 bg-gray-700 rounded-lg border border-gray-600">
                      <FaBell /> ENABLE NOTIFICATIONS
                    </button>
                    <p className="text-xs text-gray-500 mt-2">Allows the system to alert you on waifu birthdays.</p>
                  </>
                )}
              </div>

              <div className="mt-auto pt-8 border-t border-gray-700 text-xs text-gray-500 font-mono">
                <p>SYSTEM: ONLINE</p>
                <p>VERSION: 1.0.0</p>
                <p>ID: {userId}</p>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* --- 3. ADD WAIFU MODAL --- */}
      <AnimatePresence>
        {showModal && selectedChar && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 0.7 }} exit={{ opacity: 0 }} onClick={() => setShowModal(false)} className="absolute inset-0 bg-black" />
            
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="bg-gray-800 border-2 border-pink-500 p-6 rounded-xl shadow-2xl z-10 max-w-sm w-full relative">
              <h2 className="text-xl font-bold text-white mb-4 text-center">Add to Collection</h2>
              
              <div className="flex justify-center mb-4">
                <img src={selectedChar.image} alt="Preview" className="w-24 h-24 rounded-full border-2 border-pink-400 object-cover" />
              </div>
              
              <p className="text-center text-gray-300 mb-6 font-bold">{selectedChar.name}</p>
              
              {/* --- NEW DESCRIPTIVE SECTION --- */}
              <div className="bg-gray-900 p-4 rounded-lg border border-gray-700 mb-6">
                <div className="flex items-center gap-2 mb-3">
                   <span className="text-xl">🎂</span>
                   <div>
                     <label className="block text-sm text-pink-400 font-bold font-mono uppercase">Birthday Check</label>
                     <p className="text-[10px] text-gray-400 leading-tight mt-0.5">
                       "Leave blank to auto-add and confirm for the official birthdate! Use these fields only if the date is missing or unknown."
                     </p>
                   </div>
                </div>

                <div className="flex gap-2">
                  <input 
                    type="number" placeholder="Month (1-12)" min="1" max="12" 
                    value={manualDate.month} 
                    onChange={e => setManualDate({...manualDate, month: e.target.value})} 
                    className="w-1/2 p-2 bg-gray-800 text-white rounded border border-gray-600 focus:border-pink-500 outline-none text-center placeholder-gray-500 text-sm font-mono" 
                  />
                  <input 
                    type="number" placeholder="Day (1-31)" min="1" max="31" 
                    value={manualDate.day} 
                    onChange={e => setManualDate({...manualDate, day: e.target.value})} 
                    className="w-1/2 p-2 bg-gray-800 text-white rounded border border-gray-600 focus:border-pink-500 outline-none text-center placeholder-gray-500 text-sm font-mono" 
                  />
                </div>
              </div>

              <div className="flex gap-3">
                <button onClick={() => setShowModal(false)} className="flex-1 py-2 bg-gray-700 text-gray-300 rounded hover:bg-gray-600 font-bold">Cancel</button>
                <button onClick={confirmAdd} className="flex-1 py-2 bg-pink-600 text-white rounded hover:bg-pink-700 font-bold shadow-lg shadow-pink-500/30">Confirm</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <div className="max-w-4xl mx-auto p-8 pt-20"> 
        <h1 className="text-4xl font-bold text-center mb-8 text-pink-500 tracking-widest uppercase" style={{ textShadow: "0 0 10px #ec4899" }}>
          Waifu Manager <span className="text-white">AI</span>
        </h1>

        {/* --- SEARCH SECTION --- */}
        <div id="search-section" className="bg-gray-800 p-6 rounded-xl shadow-lg mb-16 border border-gray-700 relative overflow-hidden group">
          <div className="absolute top-0 left-0 w-2 h-2 bg-pink-500"></div>
          <div className="absolute top-0 right-0 w-2 h-2 bg-pink-500"></div>

          <div className="relative">
            <FaSearch className="absolute left-4 top-4 text-gray-400" />
            <input 
              type="text" 
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="SEARCH DATABASE..."
              className="w-full p-3 pl-12 rounded-lg bg-gray-900 text-white border border-gray-600 focus:border-pink-500 outline-none transition-all font-mono"
            />
             {loading && (
              <div className="absolute right-4 top-4">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-pink-500"></div>
              </div>
            )}
          </div>

          <div className="mt-6 space-y-4">
            <AnimatePresence> 
              {searchResults.map((char) => (
                <motion.div 
                  key={char.mal_id}
                  initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }} transition={{ duration: 0.2 }}
                  className={`flex items-center justify-between p-4 rounded-lg border ${char.score >= 90 ? 'bg-gray-900 border-pink-500 ring-1 ring-pink-500' : 'bg-gray-700 border-gray-600'}`}
                >
                  <div className="flex items-center gap-4 flex-1">
                     <div className="relative">
                        <img src={char.image} alt={char.name} className="w-16 h-16 rounded-sm object-cover border border-pink-500" />
                        {char.score >= 90 && <div className="absolute -top-2 -right-2 bg-pink-600 text-white text-[10px] font-bold px-2 py-0.5 rounded shadow-lg uppercase">Match</div>}
                     </div>
                     <div>
                       <h3 className="font-bold text-lg text-white font-mono">{char.name}</h3>
                       {char.nicknames && <p className="text-xs text-pink-400 font-mono">{char.nicknames}</p>}
                     </div>
                  </div>
                  
                  <button 
                    onClick={() => openAddModal(char)}
                    className="bg-pink-600 hover:bg-pink-700 text-white px-4 py-2 rounded font-bold flex items-center gap-2 ml-4"
                  >
                    <FaPlus /> ADD
                  </button>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>

        {/* --- DASHBOARD SECTION --- */}
        <h2 id="dashboard-section" className="text-2xl font-bold mb-4 border-b border-gray-700 pb-2 text-pink-400 font-mono">
        ❤︎ WAIFU COLLECTION ❤︎
        </h2>

        {/* --- NEW LOADING LOGIC STARTS HERE --- */}
        {isWakingUp ? (
          <div className="flex flex-col items-center justify-center h-64 space-y-6 bg-gray-800/50 rounded-lg border border-gray-700">
            <div className="relative">
              <div className="w-16 h-16 border-4 border-pink-500 border-t-transparent rounded-full animate-spin"></div>
              <div className="absolute top-0 left-0 w-16 h-16 border-4 border-pink-200 border-b-transparent rounded-full animate-spin opacity-30" style={{ animationDirection: 'reverse', animationDuration: '2s' }}></div>
            </div>
            <p className="text-pink-400 font-mono animate-pulse text-lg text-center">
              Waking up the waifus...<br/>
              <span className="text-sm text-gray-500">(This may take up to 30s to 60s)</span>
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pb-20">
            {myWaifus.length === 0 ? (
               <div className="col-span-full text-center py-10 text-gray-500 font-mono border border-dashed border-gray-700 rounded-lg">
                 NO DATA FOUND. SEARCH ABOVE TO ADD ONE!
               </div>
            ) : (
              myWaifus.map((waifu) => (
                <div key={waifu.id} className="bg-gray-800 p-4 rounded-lg flex items-center shadow-md border-l-4 border-pink-600 relative group hover:bg-gray-750 transition-colors">
                  <img src={waifu.image} alt={waifu.name} className="w-16 h-16 rounded-sm object-cover mr-4 opacity-80 group-hover:opacity-100 transition-opacity border-2 border-pink-500" />
                  <div className="flex-1">
                    <h3 className="font-bold text-lg font-mono tracking-tighter">{waifu.name.toUpperCase()}</h3>
                    <div className="flex justify-between items-center mt-1">
                      <span className={`text-xs font-mono px-2 py-1 rounded ${waifu.days_until === 0 ? 'bg-pink-500 text-white font-bold animate-pulse' : 'bg-gray-900 text-gray-400 border border-gray-600'}`}>
                        {waifu.status}
                      </span>
                    </div>
                  </div>
                  <button 
                    onClick={() => deleteWaifu(waifu.id)}
                    className="absolute top-2 right-2 text-gray-600 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity p-2"
                  >
                    <FaTrash />
                  </button>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default App