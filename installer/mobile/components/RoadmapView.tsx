import React from 'react';
import { ProjectSpec } from '../types';

interface RoadmapViewProps {
  roadmap: ProjectSpec['roadmap'];
}

export const RoadmapView: React.FC<RoadmapViewProps> = ({ roadmap }) => {
  return (
    <div className="space-y-16">
      {roadmap.map((item, index) => (
        <div key={index} className="relative pl-12 border-l border-[#a855f733]">
          <div className="absolute -left-[9px] top-0 w-4 h-4 bg-[#0f0f1e] border-2 border-[#a855f7] rounded-full shadow-[0_0_15px_#a855f7]"></div>
          <div className="mb-8">
             <span className="text-[10px] font-mono text-[#a855f7] uppercase tracking-[0.2em] mb-2 block font-black">Phase 0{index + 1}</span>
             <h4 className="text-2xl font-black text-white uppercase tracking-tighter italic">{item.phase}</h4>
          </div>
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {item.tasks.map((task, tIdx) => (
              <li key={tIdx} className="flex items-start gap-4 bg-[#1a1a2e]/50 p-4 rounded-xl border border-[#ffffff0a] hover:border-[#a855f722] transition-colors">
                <div className="w-5 h-5 rounded border border-[#22c55e66] flex items-center justify-center shrink-0 mt-0.5">
                  <svg className="w-3 h-3 text-[#22c55e]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <span className="text-[#94a3b8] text-sm font-light">{task}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
};