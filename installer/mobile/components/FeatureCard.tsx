import React from 'react';
import { AppFeature } from '../types';

interface FeatureCardProps {
  feature: AppFeature;
}

export const FeatureCard: React.FC<FeatureCardProps> = ({ feature }) => {
  const complexityColors = {
    Low: 'border-[#22c55e]/30 text-[#22c55e] bg-[#22c55e]/5',
    Medium: 'border-[#eab308]/30 text-[#eab308] bg-[#eab308]/5',
    High: 'border-[#ef4444]/30 text-[#ef4444] bg-[#ef4444]/5',
  };

  return (
    <div className="bg-[#1a1a2e] p-6 rounded-2xl border border-[#ffffff0a] shadow-xl hover:border-[#a855f733] transition-all">
      <div className="flex justify-between items-start mb-4">
        <h5 className="font-bold text-white uppercase text-sm tracking-tight">{feature.title}</h5>
        <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase border ${complexityColors[feature.complexity]}`}>
          {feature.complexity}
        </span>
      </div>
      <p className="text-[#94a3b8] text-xs leading-relaxed font-light">{feature.description}</p>
    </div>
  );
};