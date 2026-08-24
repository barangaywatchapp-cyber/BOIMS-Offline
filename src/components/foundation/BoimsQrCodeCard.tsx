import React, { useState, useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { QrCode, Copy, Check, Download } from 'lucide-react';
import { Badge } from './Badge';
import { Button } from './Button';

interface BoimsQrCodeCardProps {
  boimsId: string;
  userName?: string;
  userRole?: string;
  purok?: string;
  size?: number;
  showDetails?: boolean;
  className?: string;
}

export const BoimsQrCodeCard: React.FC<BoimsQrCodeCardProps> = ({
  boimsId,
  userName,
  userRole,
  purok,
  size = 160,
  showDetails = true,
  className = '',
}) => {
  const [copied, setCopied] = useState(false);
  const qrRef = useRef<HTMLDivElement>(null);

  const handleCopy = () => {
    if (!boimsId) return;
    navigator.clipboard.writeText(boimsId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    if (!qrRef.current || !boimsId) return;
    const svgElement = qrRef.current.querySelector('svg');
    if (!svgElement) return;

    const svgData = new XMLSerializer().serializeToString(svgElement);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();

    img.onload = () => {
      canvas.width = img.width + 40;
      canvas.height = img.height + 40;
      if (ctx) {
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 20, 20);
        const pngFile = canvas.toDataURL('image/png');
        const downloadLink = document.createElement('a');
        downloadLink.download = `${boimsId}-QR.png`;
        downloadLink.href = pngFile;
        downloadLink.click();
      }
    };

    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
  };

  const displayRole = typeof userRole === 'string'
    ? userRole
    : (userRole as any)?.label || (userRole ? String(userRole) : '');

  if (!boimsId) return null;

  return (
    <div className={`bg-white p-5 rounded-2xl border border-slate-200/80 shadow-2xs space-y-4 text-center ${className}`}>
      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2 text-slate-800 font-bold text-sm">
          <QrCode className="w-4 h-4 text-blue-700" />
          <span>BOIMS Identification QR</span>
        </div>
        <Badge variant="neutral" className="text-[10px] tracking-wider uppercase font-mono bg-slate-100 text-slate-600">
          Official ID
        </Badge>
      </div>

      <div className="flex flex-col items-center space-y-3 pt-1">
        <div ref={qrRef} className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl inline-block shadow-inner">
          <QRCodeSVG
            value={boimsId}
            size={size}
            bgColor="#FFFFFF"
            fgColor="#0F172A"
            level="H"
            includeMargin={false}
          />
        </div>

        {/* Exact BOIMS ID displayed alongside the QR */}
        <div className="space-y-1">
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest">BOIMS ID</p>
          <div className="inline-flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200 font-mono text-base font-bold text-slate-900 tracking-wider">
            <span>{boimsId}</span>
            <button
              onClick={handleCopy}
              className="text-slate-400 hover:text-blue-600 transition-colors p-0.5 rounded focus:outline-hidden"
              title="Copy BOIMS ID"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {showDetails && (userName || displayRole || purok) && (
          <div className="pt-2 text-xs text-slate-600 space-y-0.5 border-t border-slate-100 w-full">
            {userName && <p className="font-bold text-slate-800">{userName}</p>}
            <div className="flex items-center justify-center gap-2 text-[11px] text-slate-500">
              {displayRole && <span className="capitalize">{displayRole}</span>}
              {purok && <span>• {purok}</span>}
            </div>
          </div>
        )}

        <div className="flex items-center gap-2 pt-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleDownload}
            className="text-xs gap-1.5 py-1 px-3"
          >
            <Download className="w-3.5 h-3.5 text-blue-600" /> Save QR Code
          </Button>
        </div>
      </div>
    </div>
  );
};
