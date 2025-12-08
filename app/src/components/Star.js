import React from 'react';

const Star = ({ children, className }) => {
  return (
    <div className={`relative flex items-center justify-center ${className}`}>
      {/* Neon Outline Star SVG - Rounded Tips, Sharp Valleys */}
      <svg 
        viewBox="0 0 200 200" 
        className="absolute inset-0 w-full h-full"
        style={{ filter: 'drop-shadow(0 0 10px rgba(0, 243, 255, 0.5)) drop-shadow(0 0 20px rgba(188, 19, 254, 0.3))' }}
      >
        <defs>
          <linearGradient id="starGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#00f3ff" />
            <stop offset="100%" stopColor="#bc13fe" />
          </linearGradient>
        </defs>
        
        {/* Faint Circle Background */}
        <circle cx="100" cy="100" r="65" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="1" />

        <path
          d="M100 10 L126 75 L195 75 L140 115 L160 185 L100 145 L40 185 L60 115 L5 75 L74 75 Z"
          fill="none"
          stroke="url(#starGradient)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="animate-pulse-slow"
        />
      </svg>
      
      {/* Inner Glow */}
      <div className="absolute inset-0 bg-gradient-to-b from-pulsar-primary/5 to-pulsar-secondary/10 blur-2xl rounded-full transform scale-90"></div>

      {/* Content inside the star */}
      <div className="relative z-10 flex flex-col items-center justify-center text-center">
        {children}
      </div>
    </div>
  );
};

export default Star;

