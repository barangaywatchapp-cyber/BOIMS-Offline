/**
 * Fullscreen Print Certificate View
 * Renders the official certification document optimized for printing / PDF export.
 */

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, NavLink } from 'react-router-dom';
import { certificateService } from '../services/certificateService';
import { CertificateRequest } from '../types';
import { PrintableCertificate } from '../components/certificates/PrintableCertificate';
import { ROUTES } from '../constants';
import { ArrowLeft, Printer, Loader2 } from 'lucide-react';
import { Button } from '../components/foundation/Button';

export const PrintCertificatePage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [certificate, setCertificate] = useState<CertificateRequest | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    const loadDoc = async () => {
      if (!id) return;
      setLoading(true);
      try {
        const cert = await certificateService.getCertificateById(id);
        if (cert) {
          setCertificate(cert);
        } else {
          navigate(ROUTES.CERTIFICATES);
        }
      } catch (err) {
        console.error('Error fetching print certificate:', err);
      } finally {
        setLoading(false);
      }
    };
    loadDoc();
  }, [id]);

  const handlePrint = () => {
    window.print();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-6">
        <div className="text-center space-y-3">
          <Loader2 className="w-8 h-8 text-blue-700 animate-spin mx-auto" />
          <p className="text-sm font-semibold text-slate-700">Preparing official printable certificate...</p>
        </div>
      </div>
    );
  }

  if (!certificate) return null;

  return (
    <div className="min-h-screen bg-slate-100 py-8 px-4 sm:px-6 print:p-0 print:bg-white">
      {/* Print Control Navigation Header (Hidden during actual print) */}
      <div className="max-w-4xl mx-auto mb-6 print:hidden flex items-center justify-between bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
        <NavLink to={ROUTES.CERTIFICATE_DETAILS(certificate.certificateId)}>
          <Button variant="ghost" size="sm" icon={<ArrowLeft className="w-4 h-4" />}>
            Back to Request Details
          </Button>
        </NavLink>

        <div className="flex items-center gap-3">
          <span className="text-xs font-mono font-bold text-slate-600">{certificate.requestNumber}</span>
          <Button variant="primary" size="sm" icon={<Printer className="w-4 h-4" />} onClick={handlePrint}>
            Print / Save as PDF
          </Button>
        </div>
      </div>

      {/* Printable Certificate Template */}
      <PrintableCertificate certificate={certificate} onPrint={handlePrint} />
    </div>
  );
};
