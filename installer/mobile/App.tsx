import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI } from "@google/genai";

interface Intent {
  id: string;
  name: string;
  status: 'Freeze' | 'Analysis' | 'Execution' | 'Success';
  progress: number;
  hash: string;
}

const App: React.FC = () => {
  const [step, setStep] = useState<'INITIAL' | 'SCANNING' | 'CONFIRMING' | 'TERMINAL'>('INITIAL');
  const [vaultStatus, setVaultStatus] = useState<'locked' | 'unlocked'>('locked');
  const [isAuthorizing, setIsAuthorizing] = useState(false);
  const [alfredLogs, setAlfredLogs] = useState<{ id: number; text: string; type: 'sys' | 'alfred' | 'vault' | 'intent' }[]>([]);
  const [intents, setIntents] = useState<Intent[]>([
    { id: 'INT-772', name: 'Sovereign Node Sync', status: 'Success', progress: 100, hash: '0x88...f22' },
    { id: 'INT-810', name: 'Brain Cortex Mapping', status: 'Analysis', progress: 32, hash: '0xa1...e45' },
    { id: 'INT-904', name: 'Vault Rotation Protocol', status: 'Freeze', progress: 0, hash: '0x3c...b09' },
  ]);

  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || "" });
  const videoRef = useRef<HTMLVideoElement>(null);
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [alfredLogs]);

  const addLog = (text: string, type: 'sys' | 'alfred' | 'vault' | 'intent' = 'sys') => {
    setAlfredLogs(prev => [...prev, { id: Date.now(), text, type }]);
  };

  const generateAlfredThought = async () => {
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: "You are Alfred, the custodian assistant of BTIPS. Provide a short, cryptic line about cognitive flow, neural sync, or system monitoring using the Bloom ecosystem terminology. High-tech, formal, concise. No markdown.",
        config: { temperature: 1.1, maxOutputTokens: 50 }
      });
      addLog(response.text?.trim() || "Cognitive streams stable.", 'alfred');
    } catch (e) {
      addLog("Alfred communication flickering...", 'sys');
    }
  };

  useEffect(() => {
    if (step === 'TERMINAL') {
      const interval = setInterval(generateAlfredThought, 12000);
      return () => clearInterval(interval);
    }
  }, [step]);

  const startScanning = async () => {
    setStep('SCANNING');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      if (videoRef.current) videoRef.current.srcObject = stream;
      setTimeout(() => {
        addLog("Batcave signature detected. Validating fingerprint...");
        setStep('CONFIRMING');
        if (stream) stream.getTracks().forEach(track => track.stop());
      }, 3000);
    } catch (err) {
      addLog("Camera access denied. Sovereign ritual interrupted.", 'sys');
      setStep('INITIAL');
    }
  };

  const confirmBinding = () => {
    setStep('TERMINAL');
    addLog("Terminal Linked. ID: bloom_v1_0xBF22", 'sys');
    addLog("Cognitive engine active. Welcome back, Paladin.", 'alfred');
  };

  const authorizeIntent = (id: string) => {
    setIsAuthorizing(true);
    addLog(`Awaiting Biometric Seal for ${id}...`, 'intent');
    setTimeout(() => {
      setIntents(prev => prev.map(i => i.id === id ? { ...i, status: 'Execution', progress: 15 } : i));
      setIsAuthorizing(false);
      addLog(`Intent ${id} authorized by signature.`, 'intent');
    }, 2000);
  };

  const toggleVault = () => {
    setIsAuthorizing(true);
    const nextState = vaultStatus === 'locked' ? 'unlocked' : 'locked';
    setTimeout(() => {
      setVaultStatus(nextState);
      setIsAuthorizing(false);
      addLog(`Vault state: ${nextState.toUpperCase()}`, 'vault');
    }, 1500);
  };

  if (step === 'INITIAL' || step === 'SCANNING' || step === 'CONFIRMING') {
    return (
      <div className="min-h-screen bg-[#0f0f1e] flex flex-col items-center justify-center p-6 text-[#e2e8f0]">
        <div className="w-full max-w-md border border-[#a855f722] bg-[#1a1a2e] rounded-[2.5rem] p-10 text-center shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-[#a855f7] to-transparent opacity-40"></div>
          
          <div className="mb-10">
            <div className="w-20 h-20 mx-auto border-2 border-[#a855f744] rounded-full flex items-center justify-center animate-pulse mb-4 shadow-[0_0_30px_#a855f722]">
              <svg className="w-10 h-10 text-[#a855f7]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A10.003 10.003 0 0012 3c1.708 0 3.3.425 4.697 1.173m7.593 5.24c.445.713.694 1.554.694 2.453a4.93 4.93 0 01-1.611 3.676m-4.8 3.696a6 6 0 11-8.8-8.8" /></svg>
            </div>
            <h1 className="text-2xl font-black uppercase tracking-[0.2em] bloom-gradient-text italic">BTIPS Binding</h1>
            <p className="text-[10px] text-[#94a3b8] font-mono mt-2 tracking-widest uppercase">Protocol: BTIPS-LINK-001</p>
          </div>

          {step === 'INITIAL' && (
            <button 
              onClick={startScanning}
              className="w-full bloom-gradient-bg text-white py-5 rounded-2xl font-black uppercase tracking-widest hover:scale-[1.02] transition-all shadow-[0_0_30px_rgba(168,85,247,0.3)]"
            >
              Start Binding Ritual
            </button>
          )}

          {step === 'SCANNING' && (
            <div className="space-y-6">
              <div className="relative aspect-square w-full bg-black/40 rounded-2xl overflow-hidden border border-[#a855f733]">
                <video ref={videoRef} autoPlay playsInline className="absolute inset-0 w-full h-full object-cover opacity-60" />
                <div className="absolute inset-0 border-2 border-[#ec489944] m-10 rounded-lg animate-pulse"></div>
                <div className="absolute top-1/2 left-0 w-full h-px bg-[#ec4899] shadow-[0_0_15px_#ec4899] animate-[scan_2s_infinite]"></div>
              </div>
              <p className="text-xs animate-pulse font-mono text-[#a855f7]">Searching for Sovereign Node...</p>
            </div>
          )}

          {step === 'CONFIRMING' && (
            <div className="space-y-8">
              <div className="p-6 bg-black/30 border border-[#a855f711] rounded-2xl">
                <span className="text-[9px] text-[#94a3b8] block mb-2 uppercase tracking-widest">Org Fingerprint</span>
                <p className="text-white font-mono text-sm break-all">bloom_v1_0xBF22_Cognitive_Root</p>
              </div>
              <button 
                onClick={confirmBinding}
                className="w-full bloom-gradient-bg text-white py-5 rounded-2xl font-black uppercase tracking-widest shadow-[0_0_30px_rgba(168,85,247,0.3)]"
              >
                Confirm Sovereign Link
              </button>
            </div>
          )}

          <p className="mt-10 text-[9px] text-[#94a3b8] italic uppercase tracking-widest">Human Root of Will // Bloom OS</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0f0f1e] text-[#e2e8f0] font-mono p-4 md:p-8 flex flex-col gap-6">
      <header className="flex flex-col md:flex-row items-center justify-between gap-6 border-b border-[#ffffff0a] pb-8 bg-gradient-to-b from-[#a855f708] to-transparent -mx-4 md:-mx-8 px-8">
        <div className="flex items-center gap-6">
          <div className="w-16 h-16 bg-[#1a1a2e] border border-[#a855f733] rounded-2xl flex items-center justify-center text-[#a855f7] shadow-[0_0_20px_rgba(168,85,247,0.1)]">
             <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
          </div>
          <div>
            <h1 className="text-3xl font-black text-white italic tracking-tighter uppercase">BTIPS<span className="bloom-gradient-text">.terminal</span></h1>
            <div className="flex items-center gap-2 text-[10px] uppercase font-bold text-[#94a3b8]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#22c55e] animate-pulse"></span>
              Paladin Confirmed // Bloom Nucleus
            </div>
          </div>
        </div>

        <div className={`px-8 py-4 rounded-2xl border transition-all flex items-center gap-8 ${vaultStatus === 'locked' ? 'bg-[#1a1a2e] border-[#ef444433]' : 'bg-[#22c55e05] border-[#22c55e33]'}`}>
          <div className="text-left">
            <span className="text-[9px] block uppercase text-[#94a3b8] tracking-widest font-black">Vault Status</span>
            <span className={`text-xl font-black uppercase italic tracking-tighter ${vaultStatus === 'locked' ? 'text-[#ef4444]' : 'text-[#22c55e]'}`}>
              {vaultStatus === 'locked' ? 'Locked' : 'Unlocked'}
            </span>
          </div>
          <button 
            disabled={isAuthorizing}
            onClick={toggleVault}
            className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
              vaultStatus === 'locked' 
                ? 'bg-[#ef444410] text-[#ef4444] border border-[#ef444433] hover:bg-[#ef4444] hover:text-white' 
                : 'bg-[#22c55e10] text-[#22c55e] border border-[#22c55e33] hover:bg-[#22c55e] hover:text-white'
            }`}
          >
            {isAuthorizing ? 'Biometric Signature...' : (vaultStatus === 'locked' ? 'Authorize' : 'Secure')}
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 flex-1">
        <section className="lg:col-span-4 flex flex-col bg-[#1a1a2e] border border-[#ffffff0a] rounded-[2rem] overflow-hidden shadow-2xl h-[600px]">
          <div className="bg-[#242438] px-6 py-4 border-b border-[#ffffff0a] flex items-center justify-between">
            <span className="text-[10px] font-black uppercase text-[#94a3b8] tracking-[0.2em]">Alfred Intelligence</span>
            <span className="text-[9px] text-[#a855f7] font-mono px-2 py-0.5 bg-[#a855f711] rounded border border-[#a855f733]">COGNITIVE</span>
          </div>
          <div className="flex-1 p-6 overflow-y-auto text-xs space-y-5 scrollbar-hide">
            {alfredLogs.map((log) => (
              <div key={log.id} className="border-l border-[#ffffff11] pl-5 animate-in fade-in slide-in-from-left-4 duration-500">
                <span className={`text-[8px] font-black uppercase tracking-widest mb-1 block ${
                  log.type === 'alfred' ? 'text-[#a855f7]' : log.type === 'vault' ? 'text-[#ec4899]' : log.type === 'intent' ? 'text-blue-400' : 'text-[#94a3b8]'
                }`}>
                  [{log.type.toUpperCase()}] {new Date(log.id).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit' })}
                </span>
                <p className={`${log.type === 'alfred' ? 'text-[#e2e8f0] font-light italic' : 'text-[#94a3b8]'}`}>
                  {log.text}
                </p>
              </div>
            ))}
            <div ref={logEndRef} />
          </div>
        </section>

        <section className="lg:col-span-8 space-y-8">
          <div className="bg-[#1a1a2e] border border-[#ffffff0a] rounded-[2rem] p-10 shadow-2xl relative overflow-hidden">
            <div className="flex items-center justify-between mb-10 relative">
              <h2 className="text-2xl font-black uppercase italic text-white tracking-tighter">Intent Board</h2>
              <div className="flex gap-4">
                <div className="px-3 py-1 bg-black/20 rounded border border-[#ffffff0a] text-[9px] text-[#94a3b8] uppercase font-mono">projects.bloom/</div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-6">
              {intents.map((intent) => (
                <div key={intent.id} className="bg-black/20 border border-[#ffffff0a] rounded-2xl p-6 group hover:border-[#a855f733] transition-all relative">
                  <div className="flex items-center justify-between mb-6">
                    <div>
                      <span className="text-[10px] text-[#94a3b8] block mb-1 font-mono">{intent.hash}</span>
                      <h3 className="font-black text-xl text-white uppercase italic tracking-tighter">{intent.name}</h3>
                    </div>
                    <div className={`px-4 py-1 rounded-lg text-[10px] font-black uppercase italic ${
                      intent.status === 'Success' ? 'bg-[#22c55e10] text-[#22c55e] border border-[#22c55e22]' : 'bg-[#a855f710] text-[#a855f7] border border-[#a855f722]'
                    }`}>
                      {intent.status}
                    </div>
                  </div>
                  
                  <div className="space-y-3">
                    <div className="flex justify-between text-[10px] uppercase font-black text-[#94a3b8] tracking-widest">
                      <span>Sync Depth</span>
                      <span>{intent.progress}%</span>
                    </div>
                    <div className="h-1 bg-black/40 rounded-full overflow-hidden">
                      <div 
                        className={`h-full transition-all duration-1000 ${intent.status === 'Success' ? 'bg-[#22c55e]' : 'bloom-gradient-bg'}`} 
                        style={{ width: `${intent.progress}%` }}
                      ></div>
                    </div>
                  </div>
                  
                  {intent.status !== 'Success' && (
                    <div className="mt-8 flex justify-end">
                      <button 
                        onClick={() => authorizeIntent(intent.id)}
                        disabled={isAuthorizing}
                        className="group/btn relative px-8 py-3 bg-white text-[#0f0f1e] font-black uppercase text-[10px] tracking-widest rounded-full hover:scale-105 transition-all flex items-center gap-3"
                      >
                        {isAuthorizing ? 'Sealing...' : 'Paladin Consent'}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {[
              { label: 'Intelligence', value: 'Synced', icon: 'M15 12a3 3 0 11-6 0 3 3 0 016 0z' },
              { label: 'Nucleus', value: 'Governing', icon: 'M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9' },
              { label: 'Projects', value: 'Executing', icon: 'M3 12l2-2m0 0l7-7 7 7' },
              { label: 'Sovereignty', value: '100%', icon: 'M9 12l2 2 4-4' },
            ].map((cmd, i) => (
              <div key={i} className="bg-[#1a1a2e] border border-[#ffffff0a] p-6 rounded-2xl group hover:border-[#a855f722] transition-all">
                <svg className="w-5 h-5 text-[#94a3b8] group-hover:text-[#a855f7] mb-4 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d={cmd.icon} /></svg>
                <span className="text-[9px] font-black text-[#94a3b8] uppercase tracking-widest block mb-1">{cmd.label}</span>
                <p className="text-white font-bold text-xs uppercase italic">{cmd.value}</p>
              </div>
            ))}
          </div>
        </section>
      </div>

      <footer className="mt-12 py-8 border-t border-[#ffffff05] flex flex-col md:flex-row items-center justify-between gap-6 opacity-40 hover:opacity-100 transition-opacity">
        <div className="text-[10px] font-mono uppercase tracking-[0.5em] text-[#94a3b8]">
          BTIPS v1.0.0 // Bloom Sovereign Identity
        </div>
        <div className="text-[10px] italic bloom-gradient-text tracking-widest uppercase font-black">
          Human Root of Will
        </div>
      </footer>

      <style>{`
        @keyframes scan {
          0% { top: 0%; opacity: 0; }
          50% { opacity: 1; }
          100% { top: 100%; opacity: 0; }
        }
        .scrollbar-hide::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  );
};

export default App;