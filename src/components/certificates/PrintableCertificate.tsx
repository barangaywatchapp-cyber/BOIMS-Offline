/**
 * High-Fidelity Printable Barangay Document Component
 * Renders official Philippine Barangay Certification format with dual seals, legalese,
 * watermark, QR verification code, official signature blocks, and decorative wave footer.
 * Formatted for standard letter/A4 paper printing.
 */

import React, { useRef, useState, useEffect } from 'react';
import { CertificateRequest, BarangayProfileSettings } from '../../types';
import { APP_METADATA, CERTIFICATE_TYPES } from '../../constants';
import { adminService } from '../../services/adminService';
import { CheckCircle2, QrCode, Printer, Download, Loader2, Shield, AlertTriangle } from 'lucide-react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

// Official Seal Local Asset Path
const BARANGAY_SEAL_PATH = '/barangay-seal.svg';

interface PrintableCertificateProps {
  certificate: CertificateRequest;
  onPrint?: () => void;
}

export const PrintableCertificate: React.FC<PrintableCertificateProps> = ({
  certificate,
  onPrint,
}) => {
  const certRef = useRef<HTMLDivElement>(null);
  const [downloadingPdf, setDownloadingPdf] = useState<boolean>(false);
  const [profile, setProfile] = useState<BarangayProfileSettings | null>(null);
  const [profileLoaded, setProfileLoaded] = useState<boolean>(false);

  useEffect(() => {
    let isMounted = true;
    adminService
      .getBarangayProfile()
      .then((pData) => {
        if (isMounted) {
          setProfile(pData);
          setProfileLoaded(true);
        }
      })
      .catch((err) => {
        console.error('Failed to load barangay profile for signatories:', err);
        if (isMounted) setProfileLoaded(true);
      });
    return () => {
      isMounted = false;
    };
  }, []);

  const captainName = profile?.captainName?.trim() || 'HON. PUNONG BARANGAY';
  const secretaryName = profile?.secretaryName?.trim() || '';

  const certTypeMeta = CERTIFICATE_TYPES.find((ct) => ct.id === certificate.certificateType);
  const certTitle = certTypeMeta?.label.toUpperCase() || 'BARANGAY CERTIFICATION';

  const issueDateObj = certificate.issuedAt ? new Date(certificate.issuedAt) : new Date();
  
  const dayStr = issueDateObj.getDate().toString();
  const monthYearStr = issueDateObj.toLocaleDateString('en-PH', {
    month: 'long',
    year: 'numeric',
  });
  const fullIssueDateStr = issueDateObj.toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const expiryDateStr = certificate.expiresAt
    ? new Date(certificate.expiresAt).toLocaleDateString('en-PH', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : 'Valid for One (1) Year from Date of Issuance';

  const verificationUrl = `${window.location.origin}/certificates/verify?token=${certificate.qrVerificationToken || ''}`;

  // Extract applicant last name for formal legalese (e.g., "Juan Dela Cruz" -> "Dela Cruz")
  const nameParts = certificate.fullName.trim().split(' ');
  const applicantLastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : certificate.fullName;

  const handleDownloadPdf = async () => {
    if (!certRef.current) return;
    setDownloadingPdf(true);
    try {
      const canvas = await html2canvas(certRef.current, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
      });

      const imgWidth = 210; // A4 width in mm
      const pageHeight = 297; // A4 height in mm
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, Math.min(imgHeight, pageHeight));
      
      const fileName = `${certificate.controlNumber || certificate.requestNumber}_${certificate.fullName.replace(/\s+/g, '_')}.pdf`;
      pdf.save(fileName);
    } catch (err) {
      console.error('PDF generation error:', err);
    } finally {
      setDownloadingPdf(false);
    }
  };

  return (
    <div className="space-y-4">
      {profileLoaded && !secretaryName && (
        <div className="p-3.5 bg-amber-50 border border-amber-300 rounded-2xl text-amber-900 text-xs flex items-center gap-2.5 print:hidden">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
          <span>
            <strong>Barangay Secretary Name Not Configured:</strong> Please configure the official Barangay Secretary name in <strong>Settings &gt; Barangay Profile</strong> to render the Secretary signature block on official documents.
          </span>
        </div>
      )}

      {/* Print & Download Action Header (Hidden during actual print) */}
      <div className="print:hidden flex flex-wrap items-center justify-between gap-3 bg-slate-900 text-white px-6 py-3.5 rounded-2xl shadow-sm">
        <div className="flex items-center gap-3">
          <Shield className="w-5 h-5 text-blue-400" />
          <span className="text-sm font-semibold">
            Official Certification Document Preview ({certificate.requestNumber})
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleDownloadPdf}
            disabled={downloadingPdf}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl transition-all shadow-xs disabled:opacity-50"
          >
            {downloadingPdf ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            Download PDF Document
          </button>
          {onPrint && (
            <button
              onClick={onPrint}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl transition-all shadow-xs"
            >
              <Printer className="w-4 h-4" />
              Print Document
            </button>
          )}
        </div>
      </div>

      {/* Standard Certificate Sheet Frame (Portrait A4 Layout) */}
      <div
        ref={certRef}
        className="bg-white border-2 border-slate-300 rounded-2xl shadow-xl relative max-w-4xl mx-auto overflow-hidden text-slate-900 font-serif print:border-none print:shadow-none print:p-0 print:m-0 print:max-w-none print:rounded-none"
        style={{ minHeight: '1050px' }}
      >
        
        {/* Large Centered Watermark Seal Background */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none z-0">
          <img
            src={BARANGAY_SEAL_PATH}
            alt="Watermark Seal"
            className="w-96 h-96 opacity-[0.06] object-contain"
          />
        </div>

        {/* Certificate Outer Border Frame */}
        <div className="p-8 sm:p-12 md:p-14 relative z-10 flex flex-col justify-between min-h-full">
          
          <div>
            {/* 1. OFFICIAL HEADER WITH BALANCED DUAL SEALS */}
            <div className="flex items-center justify-between gap-4 pb-4 border-b-2 border-slate-900">
              {/* Left Seal */}
              <div className="w-20 h-20 sm:w-24 sm:h-24 shrink-0 flex items-center justify-center">
                <img
                  src={BARANGAY_SEAL_PATH}
                  alt="Barangay Seal Left"
                  className="w-full h-full object-contain"
                />
              </div>

              {/* Center Official Header Text */}
              <div className="text-center space-y-0.5 flex-1">
                <p className="text-xs uppercase tracking-widest text-slate-700 font-sans font-semibold">
                  Republic of the Philippines
                </p>
                <p className="text-xs uppercase tracking-widest text-slate-700 font-sans font-semibold">
                  Province of {APP_METADATA.defaultProvince} &bull; Municipality of {APP_METADATA.defaultMunicipality}
                </p>
                <h2 className="text-lg sm:text-xl font-extrabold tracking-wider text-blue-950 uppercase font-sans pt-0.5">
                  BARANGAY SAN SALVADOR
                </h2>
                <p className="text-xs italic font-bold text-slate-800 font-sans">
                  OFFICE OF THE PUNONG BARANGAY
                </p>
              </div>

              {/* Right Seal (Visually balanced with Left Seal) */}
              <div className="w-20 h-20 sm:w-24 sm:h-24 shrink-0 flex items-center justify-center">
                <img
                  src={BARANGAY_SEAL_PATH}
                  alt="Barangay Seal Right"
                  className="w-full h-full object-contain"
                />
              </div>
            </div>

            {/* 2. DOCUMENT TITLE BANNER */}
            <div className="my-8 text-center">
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-widest text-blue-950 border-b-2 border-t-2 border-blue-950 py-2.5 px-8 inline-block font-sans uppercase">
                {certTitle}
              </h1>
            </div>

            {/* 3. SALUTATION */}
            <div className="mt-8 mb-6 font-sans">
              <p className="text-sm font-bold tracking-wider uppercase text-slate-900">
                TO WHOM IT MAY CONCERN:
              </p>
            </div>

            {/* 4. BODY LEGALESE CONTENT */}
            <div className="space-y-6 text-base sm:text-lg leading-relaxed text-slate-900 text-justify font-sans">
              
              {/* Special Indigency Wording matched to official reference */}
              {certificate.certificateType === 'certificateOfIndigency' ? (
                <>
                  <p className="indent-10">
                    This is to certify that <strong className="uppercase underline font-bold">{certificate.fullName}</strong>, Filipino Citizen,{' '}
                    <span className="font-semibold">{certificate.civilStatus || 'Single'}</span>, resident of{' '}
                    <strong className="font-bold">{certificate.purok || 'Purok 1'}</strong>, Barangay San Salvador, Baras, Rizal and listed as one of the indigent families of this barangay.
                  </p>

                  <p className="indent-10">
                    IT IS FURTHER CERTIFIED that <strong className="uppercase font-bold">{applicantLastName}</strong> has minimal means of livelihood/income to sustain any beyond his/her regular means.
                  </p>

                  <p className="indent-10">
                    This certification is being issued upon the request of the above-named person in connection with{' '}
                    <strong className="underline uppercase font-bold">{certificate.purpose}</strong>.
                  </p>

                  <p className="indent-10 pt-2">
                    DONE AND ISSUED THIS <strong className="font-bold">{dayStr}</strong> day of <strong className="font-bold">{monthYearStr}</strong>, at the office of the Punong Barangay, Barangay San Salvador, Baras, Rizal.
                  </p>
                </>
              ) : (
                /* Preservation of other certificate types */
                <>
                  <p className="indent-10">
                    THIS IS TO CERTIFY that <strong className="uppercase underline font-bold">{certificate.fullName}</strong>,{' '}
                    {certificate.civilStatus || 'Single'}, of legal age, Filipino citizen, and a bonafide resident of{' '}
                    <strong className="font-bold">{certificate.purok || 'Purok 1'}</strong>, Barangay San Salvador, Baras, Rizal, has been residing in this barangay for approximately{' '}
                    <strong className="font-bold">{certificate.yearsOfResidency || 1} year(s)</strong> and is known to be of good moral character and law-abiding citizen.
                  </p>

                  {certificate.certificateType === 'businessClearance' && certificate.businessName && (
                    <p className="indent-10">
                      THIS IS TO FURTHER CERTIFY that <strong className="uppercase font-bold">{certificate.businessName}</strong>, owned and operated by the applicant, has complied with the preliminary barangay regulations and environmental safety requirements for business operation within the jurisdiction of Barangay San Salvador.
                    </p>
                  )}

                  {certificate.certificateType === 'barangayClearance' && (
                    <p className="indent-10">
                      BASED ON OFFICIAL RECORDS of this office, the applicant has NO DEROGATORY RECORD or pending administrative case filed against him/her as of this date.
                    </p>
                  )}

                  <p className="indent-10">
                    THIS CERTIFICATION is being issued upon the request of the interested party for the purpose of:{' '}
                    <strong className="underline uppercase font-bold">{certificate.purpose}</strong> and for whatever legal intent or purpose it may serve best.
                  </p>

                  <p className="indent-10 pt-2">
                    GIVEN and ISSUED this <strong className="font-bold">{fullIssueDateStr}</strong> at the Barangay Hall of Barangay San Salvador, Baras, Rizal, Republic of the Philippines.
                  </p>
                </>
              )}
            </div>

            {/* 5. OFFICIAL SIGNATURES BLOCK */}
            <div className="mt-16 grid grid-cols-2 gap-8 font-sans items-end">
              {/* Secretary Signature */}
              <div className="text-center space-y-1">
                <div className="h-12 border-b border-slate-900 mx-auto w-48 flex items-end justify-center pb-1">
                  <span className="font-serif italic text-xs text-blue-900 font-bold">
                    {secretaryName || '[Secretary Name Required]'}
                  </span>
                </div>
                <p className="text-xs font-bold uppercase text-slate-900 pt-1">
                  {secretaryName ? secretaryName.toUpperCase() : '[CONFIGURE SECRETARY IN SETTINGS]'}
                </p>
                <p className="text-[11px] text-slate-600 font-semibold">Barangay Secretary</p>
              </div>

              {/* Chairman Signature */}
              <div className="text-center space-y-1">
                <div className="h-12 border-b border-slate-900 mx-auto w-56 flex items-end justify-center pb-1">
                  <span className="font-serif italic text-sm text-blue-950 font-bold">
                    {captainName}
                  </span>
                </div>
                <p className="text-xs font-extrabold uppercase text-slate-950 pt-1">
                  {captainName.toUpperCase()}
                </p>
                <p className="text-[11px] text-slate-700 font-bold">Punong Barangay / Chairman</p>
              </div>
            </div>
          </div>

          {/* 6. FOOTER METADATA, QR VERIFICATION & DECORATIVE WAVE */}
          <div className="mt-12 pt-6 border-t border-slate-300 font-sans">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center text-xs text-slate-600">
              {/* Left: Official Control & Fee Details */}
              <div className="space-y-1">
                <p><strong className="text-slate-800">Control No:</strong> {certificate.controlNumber || 'CTRL-BC-2026-0000'}</p>
                <p><strong className="text-slate-800">OR Number:</strong> {certificate.orNumber || 'N/A'}</p>
                <p><strong className="text-slate-800">Amount Paid:</strong> {certificate.amount > 0 ? `₱${certificate.amount.toFixed(2)}` : 'WAIVED (Free)'}</p>
                <p><strong className="text-slate-800">Validity:</strong> {expiryDateStr}</p>
              </div>

              {/* Right: Security QR Code Box */}
              <div className="flex items-center justify-end gap-3 bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                <div className="p-2 bg-white rounded-lg border border-slate-300 shadow-2xs">
                  <QrCode className="w-10 h-10 text-slate-900" />
                </div>
                <div className="space-y-0.5 text-[10px]">
                  <p className="font-bold text-blue-950 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                    OFFICIAL DIGITAL VERIFICATION
                  </p>
                  <p className="font-mono text-slate-700">{certificate.qrVerificationToken || 'BRGY-CERT-VERIFY'}</p>
                  <p className="text-slate-500 truncate max-w-[180px]">{verificationUrl}</p>
                </div>
              </div>
            </div>

            {/* Dry Seal Notice */}
            <div className="mt-3 text-center text-[10px] text-slate-400 font-sans italic">
              * NOT VALID WITHOUT OFFICIAL BARANGAY DRY SEAL AND AUTHORIZED SIGNATURES *
            </div>
          </div>
        </div>

        {/* 7. FORMAL BLUE & GOLD DECORATIVE CURVED WAVE FOOTER */}
        <div className="w-full leading-none overflow-hidden select-none pointer-events-none">
          <svg
            className="w-full h-8 sm:h-10 block"
            viewBox="0 0 1200 120"
            preserveAspectRatio="none"
          >
            {/* Gold Accenting Bottom Wave */}
            <path
              d="M0,0 C300,90 600,20 1200,80 L1200,120 L0,120 Z"
              fill="#F59E0B"
            />
            {/* Deep Barangay Blue Primary Wave */}
            <path
              d="M0,20 C400,100 800,10 1200,60 L1200,120 L0,120 Z"
              fill="#1E3A8A"
              opacity="0.9"
            />
          </svg>
        </div>

      </div>
    </div>
  );
};

