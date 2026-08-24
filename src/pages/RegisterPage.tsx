/**
 * Page: RegisterPage
 * Production 5-Step BOIMS Resident & Official Online Self-Registration Wizard
 * Supports credentials, personal profile, location & sector tagging, government ID uploads,
 * requested role application, and automated audit/notification creation.
 */

import React, { useState } from 'react';
import { useNavigate, NavLink } from 'react-router-dom';
import { createUserWithEmailAndPassword, sendEmailVerification, deleteUser } from 'firebase/auth';
import { auth } from '../firebase/config';
import { registrationService } from '../services/registrationService';
import { validateRegistrationDocumentFile } from '../services/storageService';
import { UserRole, ResidentSector, VoterStatus } from '../types';
import { APP_METADATA, ROUTES, ROLE_LABELS } from '../constants';
import { FormField } from '../components/forms/FormField';
import { TextInput } from '../components/forms/TextInput';
import { PasswordInput } from '../components/forms/PasswordInput';
import { Select } from '../components/forms/Select';
import { Button } from '../components/foundation/Button';
import { Alert } from '../components/feedback/Alert';
import {
  Shield,
  User,
  Mail,
  Lock,
  Phone,
  Calendar,
  MapPin,
  FileCheck,
  CheckCircle2,
  Upload,
  ArrowRight,
  ArrowLeft,
  Check,
  AlertCircle,
  Eye,
  ShieldAlert,
  UserCheck,
} from 'lucide-react';

const PUROK_OPTIONS = [
  { value: 'Purok 1', label: 'Purok 1 - Riverside' },
  { value: 'Purok 2', label: 'Purok 2 - Central Proper' },
  { value: 'Purok 3', label: 'Purok 3 - Hilltop' },
  { value: 'Purok 4', label: 'Purok 4 - Lower Valley' },
  { value: 'Purok 5', label: 'Purok 5 - Coastal / Highway' },
  { value: 'Purok 6', label: 'Purok 6 - Industrial Zone' },
  { value: 'Purok 7', label: 'Purok 7 - Boundary Heights' },
];

const ID_TYPES = [
  { value: 'National ID / PhilSys', label: 'Philippine National ID (PhilSys)' },
  { value: 'Driver\'s License', label: 'LTO Driver\'s License' },
  { value: 'Philippine Passport', label: 'DFA Philippine Passport' },
  { value: 'UMID', label: 'Unified Multi-Purpose ID (UMID)' },
  { value: 'Voter\'s ID / Certification', label: 'COMELEC Voter\'s ID' },
  { value: 'Postal ID', label: 'PhlPost Postal ID' },
  { value: 'SSS / GSIS ID', label: 'SSS or GSIS Card' },
  { value: 'PhilHealth ID', label: 'PhilHealth ID Card' },
  { value: 'Barangay ID', label: 'Barangay Resident Identification Card' },
  { value: 'Senior Citizen ID', label: 'OSCA Senior Citizen ID' },
  { value: 'PWD ID', label: 'Persons with Disability (PWD) ID' },
  { value: 'Other Government ID', label: 'Other Valid Government Issued ID' },
];

const SECTOR_TAGS: { id: ResidentSector; label: string }[] = [
  { id: 'senior', label: 'Senior Citizen (60+)' },
  { id: 'pwd', label: 'Person with Disability (PWD)' },
  { id: 'soloParent', label: 'Solo Parent' },
  { id: 'fourPs', label: '4Ps Beneficiary' },
  { id: 'youth', label: 'Youth / SK (15-30)' },
  { id: 'ofw', label: 'OFW / Overseas Family' },
  { id: 'indigenous', label: 'Indigenous Peoples (IP)' },
];

const VOTER_STATUS_OPTIONS: { id: VoterStatus; label: string; sublabel: string }[] = [
  {
    id: 'registered',
    label: 'Registered Voter in Barangay',
    sublabel: 'Currently registered voter in this barangay',
  },
  {
    id: 'unregistered',
    label: 'Unregistered / Not a Voter',
    sublabel: 'Not registered or not eligible to vote',
  },
  {
    id: 'transferred',
    label: 'Transferred Voter',
    sublabel: 'Voter registration transferred from/to another precinct',
  },
];

export const RegisterPage: React.FC = () => {
  const navigate = useNavigate();

  // Registration Type Toggle: Resident vs Official
  const [registrationType, setRegistrationType] = useState<'resident' | 'purokOfficial'>('resident');

  const [currentStep, setCurrentStep] = useState<number>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [refId, setRefId] = useState('');

  // Form State
  // Step 1: Account Credentials
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Step 2: Personal Profile
  const [firstName, setFirstName] = useState('');
  const [middleName, setMiddleName] = useState('');
  const [lastName, setLastName] = useState('');
  const [suffix, setSuffix] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [gender, setGender] = useState<string>('');
  const [civilStatus, setCivilStatus] = useState<string>('');
  const [occupation, setOccupation] = useState('');

  // Step 3: Location & Sitio/Purok Jurisdiction
  const [barangay] = useState(APP_METADATA.defaultBarangay);
  const [municipality] = useState(APP_METADATA.defaultMunicipality);
  const [province] = useState(APP_METADATA.defaultProvince);
  const [purok, setPurok] = useState('');
  const [address, setAddress] = useState('');
  const [voterStatus, setVoterStatus] = useState<VoterStatus | ''>('');
  const [sectors, setSectors] = useState<ResidentSector[]>([]);

  // Step 4: Verification ID & Official Documents
  const [idType, setIdType] = useState('National ID / PhilSys');
  const [idNumber, setIdNumber] = useState('');
  const [idFrontFile, setIdFrontFile] = useState<File | null>(null);
  const [idFrontPreview, setIdFrontPreview] = useState<string>('');
  
  // Resident Specific Document
  const [selfieFile, setSelfieFile] = useState<File | null>(null);
  const [selfiePreview, setSelfiePreview] = useState<string>('');

  // Official Registration Specific Documents (Rule 4)
  const [residencyProofFile, setResidencyProofFile] = useState<File | null>(null);
  const [residencyProofPreview, setResidencyProofPreview] = useState<string>('');
  const [appointmentProofFile, setAppointmentProofFile] = useState<File | null>(null);
  const [appointmentProofPreview, setAppointmentProofPreview] = useState<string>('');

  // Step 5: Data Privacy Confirmation
  const [agreedPrivacy, setAgreedPrivacy] = useState(false);

  // Helper for Sector toggling
  const toggleSector = (sec: ResidentSector) => {
    if (sectors.includes(sec)) {
      setSectors(sectors.filter((s) => s !== sec));
    } else {
      setSectors([...sectors, sec]);
    }
  };

  // Image Upload Handlers
  const handleFrontImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      try {
        validateRegistrationDocumentFile(file);
        setError('');
        setIdFrontFile(file);
        const reader = new FileReader();
        reader.onload = () => setIdFrontPreview(reader.result as string);
        reader.readAsDataURL(file);
      } catch (err: any) {
        setError(err.message || 'Invalid ID document file.');
        e.target.value = '';
      }
    }
  };

  const handleSelfieImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      try {
        validateRegistrationDocumentFile(file);
        setError('');
        setSelfieFile(file);
        const reader = new FileReader();
        reader.onload = () => setSelfiePreview(reader.result as string);
        reader.readAsDataURL(file);
      } catch (err: any) {
        setError(err.message || 'Invalid selfie photo file.');
        e.target.value = '';
      }
    }
  };

  const handleResidencyProofChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      try {
        validateRegistrationDocumentFile(file);
        setError('');
        setResidencyProofFile(file);
        const reader = new FileReader();
        reader.onload = () => setResidencyProofPreview(reader.result as string);
        reader.readAsDataURL(file);
      } catch (err: any) {
        setError(err.message || 'Invalid residency proof file.');
        e.target.value = '';
      }
    }
  };

  const handleAppointmentProofChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      try {
        validateRegistrationDocumentFile(file);
        setError('');
        setAppointmentProofFile(file);
        const reader = new FileReader();
        reader.onload = () => setAppointmentProofPreview(reader.result as string);
        reader.readAsDataURL(file);
      } catch (err: any) {
        setError(err.message || 'Invalid appointment proof file.');
        e.target.value = '';
      }
    }
  };

  // Switch Registration Category Handler (updates state on Step 1)
  const handleCategoryChange = (type: 'resident' | 'purokOfficial') => {
    setRegistrationType(type);
    setError('');
  };

  // Helper to scroll and focus invalid field
  const scrollToAndFocusField = (elementId: string) => {
    // Defer slightly to ensure error message state renders
    setTimeout(() => {
      const el = document.getElementById(elementId);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        // Try focusing the input or select element
        if (typeof el.focus === 'function' && el.tagName !== 'DIV') {
          el.focus({ preventScroll: true });
        } else {
          const focusable = el.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
            'input, select, textarea, button'
          );
          if (focusable && typeof focusable.focus === 'function') {
            focusable.focus({ preventScroll: true });
          }
        }
      }
    }, 50);
  };

  // Step Validation
  const validateStep = (step: number): boolean => {
    setError('');

    if (step === 1) {
      if (!registrationType) {
        setError('Please select a registration type to proceed.');
        scrollToAndFocusField('reg-step1-options');
        return false;
      }
    }

    if (step === 2) {
      if (!email.trim() || !email.includes('@')) {
        setError('Please enter a valid email address.');
        scrollToAndFocusField('reg-email');
        return false;
      }
      if (password.length < 6) {
        setError('Password must be at least 6 characters long.');
        scrollToAndFocusField('reg-password');
        return false;
      }
      if (password !== confirmPassword) {
        setError('Passwords do not match. Please verify your password entry.');
        scrollToAndFocusField('reg-confirm-password');
        return false;
      }
    }

    if (step === 3) {
      if (!firstName.trim()) {
        setError('First Name and Last Name are required.');
        scrollToAndFocusField('reg-first-name');
        return false;
      }
      if (!lastName.trim()) {
        setError('First Name and Last Name are required.');
        scrollToAndFocusField('reg-last-name');
        return false;
      }
      if (!phoneNumber.trim()) {
        setError('Contact Phone Number is required for verification updates.');
        scrollToAndFocusField('reg-phone');
        return false;
      }
      if (!birthDate) {
        setError('Please enter your date of birth.');
        scrollToAndFocusField('reg-birth-date');
        return false;
      }
      if (!gender) {
        setError('Please select your gender.');
        scrollToAndFocusField('reg-gender');
        return false;
      }
      if (!civilStatus) {
        setError('Please select your civil status.');
        scrollToAndFocusField('reg-civil-status');
        return false;
      }
    }

    if (step === 4) {
      if (!purok) {
        setError('Please select your Sitio / Purok assignment.');
        scrollToAndFocusField('reg-purok');
        return false;
      }
      if (!voterStatus) {
        setError('Please select your voter registration status.');
        scrollToAndFocusField('reg-voter-status');
        return false;
      }
      if (!address.trim()) {
        setError('Detailed Street Address or House Number is required.');
        scrollToAndFocusField('reg-address');
        return false;
      }
    }

    if (step === 5) {
      if (!idNumber.trim()) {
        setError('Please enter the ID Number indicated on your document.');
        scrollToAndFocusField('reg-id-number');
        return false;
      }
      if (!idFrontFile && !idFrontPreview) {
        setError('Please upload a clear front photo of your Government-issued ID.');
        scrollToAndFocusField('reg-id-front-upload');
        return false;
      }

      // Mandatory Document checks for Sitio/Purok Official (Rule 4)
      if (registrationType === 'purokOfficial') {
        if (!residencyProofFile && !residencyProofPreview) {
          setError('Official Registration requires uploading Proof of Barangay Residency (e.g., Utility bill, Certificate of Residency).');
          scrollToAndFocusField('reg-residency-proof-upload');
          return false;
        }
        if (!appointmentProofFile && !appointmentProofPreview) {
          setError('Official Registration requires uploading Proof of Official Appointment (e.g., Appointment Order, Designation Paper).');
          scrollToAndFocusField('reg-appointment-proof-upload');
          return false;
        }
      }
    }

    if (step === 6) {
      if (!agreedPrivacy) {
        setError('You must agree to the Data Privacy Notice to submit your registration.');
        scrollToAndFocusField('reg-privacy-agreement');
        return false;
      }
    }

    return true;
  };

  const nextStep = () => {
    if (validateStep(currentStep)) {
      setCurrentStep((prev) => Math.min(prev + 1, 6));
    }
  };

  const prevStep = () => {
    setError('');
    setCurrentStep((prev) => Math.max(prev - 1, 1));
  };

  // Final Form Submission with Atomic Rollback
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateStep(6)) return;

    setLoading(true);
    setError('');

    let createdUser: any = null;

    try {
      const cleanEmail = email.trim().toLowerCase();
      const targetRole: UserRole = registrationType === 'purokOfficial' ? 'purokOfficial' : 'resident';
      const fullName = [firstName, middleName, lastName, suffix].filter(Boolean).join(' ').trim();

      // Step 1: Create Firebase Auth user account
      const userCredential = await createUserWithEmailAndPassword(auth, cleanEmail, password);
      createdUser = userCredential.user;

      // Step 2: Send native Firebase email verification link
      const actionCodeSettings = {
        url: `${window.location.origin}/verify-email`,
        handleCodeInApp: true,
      };

      try {
        await sendEmailVerification(createdUser, actionCodeSettings);
      } catch (verifySendErr: any) {
        console.error('[RegisterPage] sendEmailVerification failed:', verifySendErr);
        // Atomic rollback: Delete orphaned Auth user
        try {
          await deleteUser(createdUser);
          createdUser = null;
        } catch (rollbackDelErr) {
          console.error('[RegisterPage] Rollback deleteUser failed after email error:', rollbackDelErr);
        }
        throw new Error(
          verifySendErr.message || 'Failed to dispatch verification email. Account creation was safely rolled back. Please verify your email address and try again.'
        );
      }

      // Step 3: Persist official RegistrationApplication record in Firestore
      const timestamp = new Date().toISOString();
      const registrationAppDoc = {
        registrationId: createdUser.uid,
        uid: createdUser.uid,
        registrationType,
        firstName: firstName.trim(),
        middleName: middleName?.trim() || '',
        lastName: lastName.trim(),
        suffix: suffix?.trim() || '',
        fullName,
        email: cleanEmail,
        phoneNumber: phoneNumber.trim(),
        birthDate,
        gender,
        civilStatus,
        occupation: occupation?.trim() || '',
        address: address.trim(),
        purok,
        barangay: barangay || 'Barangay Central',
        municipality: municipality || 'Baras',
        province: province || 'Rizal',
        postalCode: '1970',
        requestedRole: targetRole,
        sectors: sectors || [],
        voterStatus: voterStatus || 'registered',
        verificationMethod: 'governmentId' as const,
        idType: idType || '',
        idNumber: idNumber || '',
        idFrontUrl: '',
        idBackUrl: '',
        selfieUrl: '',
        supportingDocType: '',
        supportingDocUrl: '',
        residencyProofUrl: '',
        appointmentProofUrl: '',
        documentRefs: {},
        emailVerified: false,
        status: 'pending' as const,
        submittedAt: timestamp,
        updatedAt: timestamp,
      };

      try {
        await registrationService.createRegistrationApplication(registrationAppDoc);
      } catch (firestoreErr: any) {
        console.error('[RegisterPage] Firestore registration persistence failed:', firestoreErr);
        // Atomic rollback: Delete orphaned Auth user
        try {
          await deleteUser(createdUser);
          createdUser = null;
        } catch (rollbackDelErr) {
          console.error('[RegisterPage] Rollback deleteUser failed after Firestore error:', rollbackDelErr);
        }
        throw new Error(
          firestoreErr.message || 'Failed to save registration record. Account creation was safely rolled back. Please try again.'
        );
      }

      setRefId(createdUser.uid);
      setSuccess(true);
    } catch (err: any) {
      console.error('Registration submission failed:', err);
      let userFriendlyMsg = err.message || 'Failed to submit registration. Please check your data and try again.';
      if (err.code === 'auth/email-already-in-use') {
        userFriendlyMsg = 'This email address is already registered in BOIMS. If you previously registered, please sign in to complete verification or reset your password.';
      } else if (err.code === 'auth/weak-password') {
        userFriendlyMsg = 'Password is too weak. Please use at least 6 characters.';
      } else if (err.code === 'auth/invalid-email') {
        userFriendlyMsg = 'The provided email address is invalid.';
      }
      setError(userFriendlyMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col justify-center py-10 px-4 sm:px-6 lg:px-8 font-sans">
      <div className="sm:mx-auto sm:w-full sm:max-w-2xl">
        {/* Logo and Header */}
        <div className="text-center space-y-2 mb-8">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-blue-700 flex items-center justify-center shadow-md">
            <Shield className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            BOIMS Registration Portal
          </h1>
          <p className="text-xs sm:text-sm text-slate-500">
            {APP_METADATA.defaultBarangay}, {APP_METADATA.defaultMunicipality}, {APP_METADATA.defaultProvince}
          </p>
        </div>

        {/* Success Screen */}
        {success ? (
          <div className="bg-white border border-slate-200/90 rounded-2xl p-8 shadow-xl space-y-6 text-center">
            <div className="mx-auto w-16 h-16 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-200">
              <CheckCircle2 className="w-10 h-10" />
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-extrabold text-slate-900">Application Submitted!</h2>
              <p className="text-xs sm:text-sm text-slate-600 max-w-md mx-auto">
                A verification link has been sent to <strong className="text-blue-700">{email}</strong>. Please check your inbox and spam folder to confirm your email address.
              </p>
            </div>

            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-left text-xs space-y-2">
              <div className="flex justify-between items-center border-b border-slate-200 pb-2">
                <span className="text-slate-500">Application Reference ID:</span>
                <span className="font-mono font-bold text-blue-700 text-sm">{refId}</span>
              </div>
              <div className="flex justify-between items-center border-b border-slate-200 pb-2">
                <span className="text-slate-500">Applicant:</span>
                <span className="font-semibold text-slate-900">{firstName} {lastName}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Status:</span>
                <span className="bg-amber-50 text-amber-800 font-bold px-2.5 py-0.5 rounded-md border border-amber-200">
                  PENDING EMAIL VERIFICATION
                </span>
              </div>
            </div>

            <div className="bg-blue-50/60 border border-blue-200 rounded-xl p-4 text-xs text-blue-900 text-left space-y-1.5">
              <p className="font-bold text-blue-900">Next Step: Verify Email Ownership</p>
              <p className="text-slate-600 leading-relaxed">
                Click the single-use verification link sent to your email (<strong>{email}</strong>). Once verified, your BOIMS account will be activated and forwarded to the Barangay Verification Officers for document review.
              </p>
            </div>

            <Button
              variant="primary"
              size="lg"
              fullWidth
              onClick={() => navigate(ROUTES.LOGIN)}
              icon={<ArrowRight className="w-5 h-5" />}
              className="font-bold"
            >
              Proceed to Sign In
            </Button>
          </div>
        ) : (
          /* Multi-Step Wizard Card */
          <div className="bg-white border border-slate-200/90 rounded-2xl shadow-xl p-6 sm:p-8 space-y-6">
            {/* Wizard Progress Steps Indicator (6 Steps) */}
            <div className="grid grid-cols-6 gap-1 border-b border-slate-200 pb-6 text-center text-xs">
              {[
                { step: 1, label: 'Type' },
                { step: 2, label: 'Account' },
                { step: 3, label: 'Profile' },
                { step: 4, label: 'Location' },
                { step: 5, label: 'ID Upload' },
                { step: 6, label: 'Confirm' },
              ].map((s) => (
                <div key={s.step} className="flex flex-col items-center gap-1.5">
                  <div
                    className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center font-bold transition-all text-xs ${
                      currentStep === s.step
                        ? 'bg-blue-700 text-white ring-4 ring-blue-100'
                        : currentStep > s.step
                        ? 'bg-emerald-600 text-white'
                        : 'bg-slate-100 text-slate-500 border border-slate-200'
                    }`}
                  >
                    {currentStep > s.step ? <Check className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> : s.step}
                  </div>
                  <span
                    className={`text-[10px] sm:text-[11px] font-semibold hidden md:inline truncate ${
                      currentStep === s.step ? 'text-blue-700 font-bold' : 'text-slate-500'
                    }`}
                  >
                    {s.label}
                  </span>
                </div>
              ))}
            </div>

            {error && <Alert type="error">{error}</Alert>}

            <form onSubmit={handleSubmit} className="space-y-6">
              {/* STEP 1: Registration Type Selection */}
              {currentStep === 1 && (
                <div className="space-y-5">
                  <div className="border-b border-slate-200 pb-3">
                    <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                      <UserCheck className="w-5 h-5 text-blue-700" />
                      Step 1: Select Registration Type
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Choose your registration category to customize your application requirements.
                    </p>
                  </div>

                  {/* Registration Type Option Cards */}
                  <div id="reg-step1-options" className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Resident Registration Option */}
                    <button
                      type="button"
                      onClick={() => handleCategoryChange('resident')}
                      className={`p-5 rounded-2xl border-2 text-left transition-all flex flex-col justify-between gap-4 cursor-pointer ${
                        registrationType === 'resident'
                          ? 'border-blue-700 bg-blue-50/60 shadow-md ring-2 ring-blue-100'
                          : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/60'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div
                          className={`w-12 h-12 rounded-xl flex items-center justify-center transition-colors ${
                            registrationType === 'resident'
                              ? 'bg-blue-700 text-white'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          <User className="w-6 h-6" />
                        </div>
                        <div
                          className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                            registrationType === 'resident'
                              ? 'border-blue-700 bg-blue-700 text-white'
                              : 'border-slate-300 bg-white'
                          }`}
                        >
                          {registrationType === 'resident' && <Check className="w-3.5 h-3.5" />}
                        </div>
                      </div>

                      <div>
                        <h4 className="font-bold text-slate-900 text-base">Resident Registration</h4>
                        <p className="text-xs text-slate-600 mt-1 font-medium">For community citizens</p>
                        <p className="text-[11px] text-slate-500 mt-2 leading-relaxed">
                          Provides verified community residents with access to online certificate requests, clearance processing, and incident reporting.
                        </p>
                      </div>
                    </button>

                    {/* Official Registration Option */}
                    <button
                      type="button"
                      onClick={() => handleCategoryChange('purokOfficial')}
                      className={`p-5 rounded-2xl border-2 text-left transition-all flex flex-col justify-between gap-4 cursor-pointer ${
                        registrationType === 'purokOfficial'
                          ? 'border-blue-700 bg-blue-50/60 shadow-md ring-2 ring-blue-100'
                          : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/60'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div
                          className={`w-12 h-12 rounded-xl flex items-center justify-center transition-colors ${
                            registrationType === 'purokOfficial'
                              ? 'bg-blue-700 text-white'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          <Shield className="w-6 h-6" />
                        </div>
                        <div
                          className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                            registrationType === 'purokOfficial'
                              ? 'border-blue-700 bg-blue-700 text-white'
                              : 'border-slate-300 bg-white'
                          }`}
                        >
                          {registrationType === 'purokOfficial' && <Check className="w-3.5 h-3.5" />}
                        </div>
                      </div>

                      <div>
                        <h4 className="font-bold text-slate-900 text-base">Official Registration</h4>
                        <p className="text-xs text-slate-600 mt-1 font-medium">Sitio / Purok Official application</p>
                        <p className="text-[11px] text-slate-500 mt-2 leading-relaxed">
                          For designated Sitio/Purok Officials. Requires 3 verification documents: Government ID, Proof of Residency, and Proof of Official Appointment.
                        </p>
                      </div>
                    </button>
                  </div>

                  {/* Information Banner for Selected Type */}
                  <div className="p-3.5 bg-blue-50/70 border border-blue-200/90 rounded-xl text-xs text-blue-950 flex items-start gap-2.5">
                    <AlertCircle className="w-4 h-4 text-blue-700 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold block text-slate-900">
                        {registrationType === 'purokOfficial'
                          ? 'Selected Mode: Sitio / Purok Official Registration'
                          : 'Selected Mode: Resident Self-Registration'}
                      </span>
                      <span className="text-slate-600 text-[11px] leading-relaxed">
                        {registrationType === 'purokOfficial'
                          ? 'Your account will be designated as a Purok Official upon administrative validation of your appointment credentials.'
                          : 'Your account will be registered under Resident status with full access to citizen e-services.'}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* STEP 2: Account Credentials */}
              {currentStep === 2 && (
                <div className="space-y-4">
                  <div className="border-b border-slate-200 pb-3">
                    <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                      <Lock className="w-5 h-5 text-blue-700" />
                      Step 2: Create Account Credentials
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Enter a valid email and strong password for system authentication.
                    </p>
                  </div>

                  <FormField label="Email Address" required>
                    <TextInput
                      id="reg-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="resident@example.com"
                      prefixIcon={<Mail className="w-4 h-4 text-slate-400" />}
                      required
                    />
                  </FormField>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <FormField label="Password" required hint="At least 6 characters">
                      <PasswordInput
                        id="reg-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        required
                      />
                    </FormField>

                    <FormField label="Confirm Password" required>
                      <PasswordInput
                        id="reg-confirm-password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="••••••••"
                        required
                      />
                    </FormField>
                  </div>

                  {password && confirmPassword && password !== confirmPassword && (
                    <p className="text-xs text-red-600 font-medium flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5" /> Passwords do not match.
                    </p>
                  )}
                </div>
              )}

              {/* STEP 3: Personal Profile */}
              {currentStep === 3 && (
                <div className="space-y-4">
                  <div className="border-b border-slate-200 pb-3">
                    <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                      <User className="w-5 h-5 text-blue-700" />
                      Step 3: Personal Profile Information
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Ensure your legal name matches your government ID document.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <FormField label="First Name" required>
                      <TextInput
                        id="reg-first-name"
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value.toUpperCase())}
                        placeholder="e.g. JUAN"
                        required
                      />
                    </FormField>

                    <FormField label="Middle Name">
                      <TextInput
                        id="reg-middle-name"
                        value={middleName}
                        onChange={(e) => setMiddleName(e.target.value.toUpperCase())}
                        placeholder="e.g. SANTOS"
                      />
                    </FormField>

                    <FormField label="Last Name" required>
                      <TextInput
                        id="reg-last-name"
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value.toUpperCase())}
                        placeholder="e.g. DELA CRUZ"
                        required
                      />
                    </FormField>

                    <FormField label="Suffix">
                      <TextInput
                        id="reg-suffix"
                        value={suffix}
                        onChange={(e) => setSuffix(e.target.value.toUpperCase())}
                        placeholder="e.g. JR., III"
                      />
                    </FormField>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <FormField label="Contact Mobile Phone" required>
                      <TextInput
                        id="reg-phone"
                        type="tel"
                        value={phoneNumber}
                        onChange={(e) => setPhoneNumber(e.target.value.replace(/\D/g, ''))}
                        placeholder="09171234567"
                        prefixIcon={<Phone className="w-4 h-4 text-slate-400" />}
                        required
                      />
                    </FormField>

                    <FormField label="Date of Birth" required>
                      <TextInput
                        id="reg-birth-date"
                        type="date"
                        value={birthDate}
                        onChange={(e) => setBirthDate(e.target.value)}
                        required
                      />
                    </FormField>

                    <FormField label="Gender" required>
                      <Select
                        id="reg-gender"
                        value={gender}
                        onChange={(e) => setGender(e.target.value)}
                        placeholder="Select Gender"
                        options={[
                          { value: 'male', label: 'Male' },
                          { value: 'female', label: 'Female' },
                          { value: 'other', label: 'Other / Prefer not to say' },
                        ]}
                      />
                    </FormField>

                    <FormField label="Civil Status" required>
                      <Select
                        id="reg-civil-status"
                        value={civilStatus}
                        onChange={(e) => setCivilStatus(e.target.value)}
                        placeholder="Select Civil Status"
                        options={[
                          { value: 'single', label: 'Single' },
                          { value: 'married', label: 'Married' },
                          { value: 'widowed', label: 'Widowed' },
                          { value: 'separated', label: 'Separated' },
                        ]}
                      />
                    </FormField>
                  </div>

                  <FormField label="Occupation / Source of Livelihood">
                    <TextInput
                      value={occupation}
                      onChange={(e) => setOccupation(e.target.value)}
                      placeholder="e.g. Private Employee, Vendor, Student, Unemployed"
                    />
                  </FormField>
                </div>
              )}

              {/* STEP 4: Location & Sector Details */}
              {currentStep === 4 && (
                <div className="space-y-4">
                  <div className="border-b border-slate-200 pb-3">
                    <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                      <MapPin className="w-5 h-5 text-blue-700" />
                      Step 4: Location & Special Sector Tagging
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Specify your residential address inside Barangay Central.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                    <div>
                      <span className="text-slate-500 block font-medium">Barangay:</span>
                      <span className="font-bold text-slate-900">{barangay}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block font-medium">Municipality:</span>
                      <span className="font-bold text-slate-900">{municipality}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block font-medium">Province:</span>
                      <span className="font-bold text-slate-900">{province}</span>
                    </div>
                  </div>

                  <FormField label="Sitio / Purok Assignment" required>
                    <Select
                      id="reg-purok"
                      value={purok}
                      onChange={(e) => setPurok(e.target.value)}
                      placeholder="Select Sitio / Purok"
                      options={PUROK_OPTIONS}
                    />
                  </FormField>

                  {/* Voter Registration Status Cards */}
                  <div id="reg-voter-status" className="space-y-2">
                    <label className="text-xs font-semibold uppercase tracking-wider text-slate-700 block">
                      Voter Registration Status <span className="text-red-600">*</span>
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      {VOTER_STATUS_OPTIONS.map((opt) => (
                        <label
                          key={opt.id}
                          className={`flex items-start gap-2.5 p-3 rounded-xl border text-xs cursor-pointer transition-all ${
                            voterStatus === opt.id
                              ? 'bg-blue-50/70 border-blue-600 text-blue-950 font-semibold shadow-2xs'
                              : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={voterStatus === opt.id}
                            onChange={() => setVoterStatus(opt.id)}
                            className="w-4 h-4 text-blue-700 rounded bg-white border-slate-300 focus:ring-blue-600 mt-0.5 shrink-0"
                          />
                          <div className="space-y-0.5">
                            <span className="block leading-tight font-semibold text-slate-900">{opt.label}</span>
                            <span className="text-[11px] text-slate-500 font-normal block leading-tight">
                              {opt.sublabel}
                            </span>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>

                  <FormField label="Detailed Street Address / House Number" required>
                    <TextInput
                      id="reg-address"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      placeholder="e.g. Block 4 Lot 12, Acacia Street"
                      required
                    />
                  </FormField>

                  {/* Sector Tags Checkboxes */}
                  <div className="space-y-2 pt-2">
                    <label className="text-xs font-semibold uppercase tracking-wider text-slate-700 block">
                      Special Sector Categorization (Check all that apply):
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {SECTOR_TAGS.map((st) => (
                        <label
                          key={st.id}
                          className={`flex items-center gap-2.5 p-2.5 rounded-xl border text-xs cursor-pointer transition-all ${
                            sectors.includes(st.id)
                              ? 'bg-blue-50/70 border-blue-600 text-blue-950 font-semibold shadow-2xs'
                              : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={sectors.includes(st.id)}
                            onChange={() => toggleSector(st.id)}
                            className="w-4 h-4 text-blue-700 rounded bg-white border-slate-300 focus:ring-blue-600"
                          />
                          <span className="text-slate-800 font-medium">{st.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* STEP 5: Verification Document Uploads */}
              {currentStep === 5 && (
                <div className="space-y-5">
                  <div className="border-b border-slate-200 pb-3">
                    <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                      <FileCheck className="w-5 h-5 text-blue-700" />
                      Step 5: Verification Documents Upload
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {registrationType === 'purokOfficial'
                        ? 'Official Registration requires 3 mandatory verification documents.'
                        : 'Upload clear photos of your valid government-issued identity card.'}
                    </p>
                  </div>

                  {/* Secure Staging Mode Notice */}
                  <div className="bg-blue-50/70 border border-blue-200 rounded-xl p-3.5 flex items-start gap-2.5 text-xs text-blue-950">
                    <Shield className="w-4 h-4 text-blue-700 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold text-slate-900 block mb-0.5">
                        Secure Identity Verification Staging
                      </span>
                      <p className="text-[11px] text-slate-600">
                        Identity documents are validated locally during registration. After confirming your email and logging in to your account, documents will be securely archived directly into Firebase Storage for Barangay official verification.
                      </p>
                    </div>
                  </div>

                  {/* Document 1: Government ID (Required for both) */}
                  <div className="space-y-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
                    <span className="text-xs font-bold text-blue-700 uppercase tracking-wider block">
                      1. Government-Issued Identification Document <span className="text-red-600">*</span>
                    </span>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <FormField label="Government ID Type" required>
                        <Select
                          id="reg-id-type"
                          value={idType}
                          onChange={(e) => setIdType(e.target.value)}
                          options={ID_TYPES}
                        />
                      </FormField>

                      <FormField label="ID Document Number" required>
                        <TextInput
                          id="reg-id-number"
                          value={idNumber}
                          onChange={(e) => setIdNumber(e.target.value)}
                          placeholder="e.g. 1234-5678-9012"
                          required
                        />
                      </FormField>
                    </div>

                    <div id="reg-id-front-upload" className="border-2 border-dashed border-slate-300 hover:border-blue-500 rounded-xl p-4 text-center bg-white transition-colors">
                      {idFrontPreview ? (
                        <div className="space-y-3">
                          <img
                            src={idFrontPreview}
                            alt="Front ID Preview"
                            className="max-h-40 mx-auto rounded-lg shadow-sm border border-slate-200 object-contain"
                          />
                          <p className="text-xs text-emerald-600 font-semibold flex items-center justify-center gap-1">
                            <CheckCircle2 className="w-4 h-4" /> Government ID Photo Attached
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-2 py-3">
                          <Upload className="w-7 h-7 text-slate-400 mx-auto" />
                          <p className="text-xs text-slate-800 font-semibold">
                            Upload Photo of Government ID
                          </p>
                          <p className="text-[10px] text-slate-500">JPG, JPEG, JFIF, PNG, WEBP, or PDF (max 10MB)</p>
                        </div>
                      )}
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/jfif,image/pjpeg,application/pdf,.jpg,.jpeg,.jfif,.png,.webp,.pdf"
                        onChange={handleFrontImageChange}
                        className="mt-2 text-xs text-slate-600 file:mr-4 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-blue-700 file:text-white hover:file:bg-blue-800 cursor-pointer"
                      />
                    </div>
                  </div>

                  {/* If Resident Registration: Selfie Photo */}
                  {registrationType === 'resident' && (
                    <div className="space-y-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
                      <span className="text-xs font-bold text-blue-700 uppercase tracking-wider block">
                        2. Facial Selfie / Portrait Photo
                      </span>
                      <div className="border-2 border-dashed border-slate-300 hover:border-blue-500 rounded-xl p-4 text-center bg-white transition-colors">
                        {selfiePreview ? (
                          <div className="space-y-3">
                            <img
                              src={selfiePreview}
                              alt="Selfie Preview"
                              className="max-h-36 mx-auto rounded-lg shadow-sm border border-slate-200 object-contain"
                            />
                            <p className="text-xs text-emerald-600 font-semibold flex items-center justify-center gap-1">
                              <CheckCircle2 className="w-4 h-4" /> Selfie Photo Attached
                            </p>
                          </div>
                        ) : (
                          <div className="space-y-2 py-2">
                            <User className="w-6 h-6 text-slate-400 mx-auto" />
                            <p className="text-xs text-slate-800 font-medium">Attach clear facial selfie holding ID</p>
                            <p className="text-[10px] text-slate-500">JPG, JPEG, JFIF, PNG, or WEBP (max 10MB)</p>
                          </div>
                        )}
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp,image/jfif,image/pjpeg,.jpg,.jpeg,.jfif,.png,.webp"
                          onChange={handleSelfieImageChange}
                          className="mt-2 text-xs text-slate-600 file:mr-4 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-slate-200 file:text-slate-800 hover:file:bg-slate-300 cursor-pointer"
                        />
                      </div>
                    </div>
                  )}

                  {/* If Sitio/Purok Official Registration: Document 2 (Proof of Residency) & Document 3 (Proof of Appointment) */}
                  {registrationType === 'purokOfficial' && (
                    <>
                      {/* Document 2: Proof of Residency */}
                      <div className="space-y-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
                        <span className="text-xs font-bold text-blue-700 uppercase tracking-wider block">
                          2. Proof of Barangay Residency <span className="text-red-600">*</span>
                        </span>
                        <p className="text-[11px] text-slate-500">
                          Upload utility bill (electricity/water), Barangay Certificate of Residency, or lease contract.
                        </p>

                        <div id="reg-residency-proof-upload" className="border-2 border-dashed border-slate-300 hover:border-blue-500 rounded-xl p-4 text-center bg-white transition-colors">
                          {residencyProofPreview ? (
                            <div className="space-y-3">
                              <img
                                src={residencyProofPreview}
                                alt="Residency Proof Preview"
                                className="max-h-36 mx-auto rounded-lg shadow-sm border border-slate-200 object-contain"
                              />
                              <p className="text-xs text-emerald-600 font-semibold flex items-center justify-center gap-1">
                                <CheckCircle2 className="w-4 h-4" /> Proof of Residency Document Attached
                              </p>
                            </div>
                          ) : (
                            <div className="space-y-2 py-3">
                              <Upload className="w-7 h-7 text-slate-400 mx-auto" />
                              <p className="text-xs text-slate-800 font-semibold">
                                Upload Proof of Residency Document
                              </p>
                              <p className="text-[10px] text-slate-500">JPG, JPEG, JFIF, PNG, WEBP, or PDF (max 10MB)</p>
                            </div>
                          )}
                          <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp,image/jfif,image/pjpeg,application/pdf,.jpg,.jpeg,.jfif,.png,.webp,.pdf"
                            onChange={handleResidencyProofChange}
                            className="mt-2 text-xs text-slate-600 file:mr-4 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-blue-700 file:text-white hover:file:bg-blue-800 cursor-pointer"
                          />
                        </div>
                      </div>

                      {/* Document 3: Proof of Official Appointment */}
                      <div className="space-y-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
                        <span className="text-xs font-bold text-blue-700 uppercase tracking-wider block">
                          3. Proof of Official Appointment <span className="text-red-600">*</span>
                        </span>
                        <p className="text-[11px] text-slate-500">
                          Upload official appointment letter, Appointment Order, or Barangay Chairman designation paper.
                        </p>

                        <div id="reg-appointment-proof-upload" className="border-2 border-dashed border-slate-300 hover:border-blue-500 rounded-xl p-4 text-center bg-white transition-colors">
                          {appointmentProofPreview ? (
                            <div className="space-y-3">
                              <img
                                src={appointmentProofPreview}
                                alt="Appointment Proof Preview"
                                className="max-h-36 mx-auto rounded-lg shadow-sm border border-slate-200 object-contain"
                              />
                              <p className="text-xs text-emerald-600 font-semibold flex items-center justify-center gap-1">
                                <CheckCircle2 className="w-4 h-4" /> Proof of Official Appointment Attached
                              </p>
                            </div>
                          ) : (
                            <div className="space-y-2 py-3">
                              <Upload className="w-7 h-7 text-slate-400 mx-auto" />
                              <p className="text-xs text-slate-800 font-semibold">
                                Upload Appointment Order / Designation Paper
                              </p>
                              <p className="text-[10px] text-slate-500">JPG, JPEG, JFIF, PNG, WEBP, or PDF (max 10MB)</p>
                            </div>
                          )}
                          <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp,image/jfif,image/pjpeg,application/pdf,.jpg,.jpeg,.jfif,.png,.webp,.pdf"
                            onChange={handleAppointmentProofChange}
                            className="mt-2 text-xs text-slate-600 file:mr-4 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-blue-700 file:text-white hover:file:bg-blue-800 cursor-pointer"
                          />
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* STEP 6: Final Review & Data Privacy Confirmation */}
              {currentStep === 6 && (
                <div className="space-y-4">
                  <div className="border-b border-slate-200 pb-3">
                    <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                      <Shield className="w-5 h-5 text-blue-700" />
                      Step 6: Review & Submit Registration
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Review your entered application details prior to submission.
                    </p>
                  </div>

                  {/* Fixed Role Display per specification rule 2 */}
                  <div className="p-3.5 bg-blue-50/70 border border-blue-200 rounded-xl text-xs flex items-center justify-between">
                    <span className="text-slate-700 font-medium">Applied Account Role:</span>
                    <span className="font-extrabold text-white bg-blue-700 px-3 py-1 rounded-lg uppercase shadow-2xs">
                      {registrationType === 'purokOfficial' ? 'Sitio/Purok Official' : 'Resident'}
                    </span>
                  </div>

                  {/* Application Data Summary */}
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs space-y-2">
                    <div className="flex justify-between border-b border-slate-200 pb-1.5">
                      <span className="text-slate-500">Full Name:</span>
                      <span className="font-bold text-slate-900">{firstName} {middleName} {lastName} {suffix}</span>
                    </div>
                    <div className="flex justify-between border-b border-slate-200 pb-1.5">
                      <span className="text-slate-500">Email & Contact:</span>
                      <span className="text-slate-800">{email} ({phoneNumber})</span>
                    </div>
                    <div className="flex justify-between border-b border-slate-200 pb-1.5">
                      <span className="text-slate-500">Jurisdiction / Purok:</span>
                      <span className="font-semibold text-blue-700">{purok}, {address}</span>
                    </div>
                    <div className="flex justify-between border-b border-slate-200 pb-1.5">
                      <span className="text-slate-500">Voter Registration Status:</span>
                      <span className="font-semibold text-slate-800">
                        {voterStatus === 'registered'
                          ? 'Registered Voter in Barangay'
                          : voterStatus === 'transferred'
                          ? 'Transferred Voter'
                          : 'Unregistered / Not a Voter'}
                      </span>
                    </div>
                    <div className="flex justify-between border-b border-slate-200 pb-1.5">
                      <span className="text-slate-500">Government ID:</span>
                      <span className="text-slate-800">{idType} (#{idNumber})</span>
                    </div>
                    {registrationType === 'purokOfficial' && (
                      <div className="flex justify-between border-b border-slate-200 pb-1.5">
                        <span className="text-slate-500">Required Documents:</span>
                        <span className="text-emerald-700 font-semibold">ID + Proof of Residency + Proof of Appointment</span>
                      </div>
                    )}
                  </div>

                  {/* Privacy Agreement */}
                  <label id="reg-privacy-agreement" className="flex items-start gap-3 p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs cursor-pointer">
                    <input
                      id="reg-privacy-checkbox"
                      type="checkbox"
                      checked={agreedPrivacy}
                      onChange={(e) => setAgreedPrivacy(e.target.checked)}
                      className="w-4 h-4 text-blue-700 rounded bg-white border-slate-300 focus:ring-blue-600 mt-0.5"
                      required
                    />
                    <span className="text-slate-700 leading-relaxed">
                      I declare that the information provided is accurate and true. I authorize Barangay Central to verify my identity in compliance with the <strong>Philippine Data Privacy Act of 2012 (RA 10173)</strong>.
                    </span>
                  </label>
                </div>
              )}

              {/* Navigation Actions */}
              <div className="flex items-center justify-between border-t border-slate-200 pt-6">
                {currentStep > 1 ? (
                  <Button
                    type="button"
                    variant="secondary"
                    size="md"
                    onClick={prevStep}
                    disabled={loading}
                    icon={<ArrowLeft className="w-4 h-4" />}
                    className="bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200"
                  >
                    Back
                  </Button>
                ) : (
                  <NavLink
                    to={ROUTES.LOGIN}
                    className="text-xs text-blue-700 hover:text-blue-800 font-bold"
                  >
                    Already registered? Sign In
                  </NavLink>
                )}

                {currentStep < 6 ? (
                  <Button
                    type="button"
                    variant="primary"
                    size="md"
                    onClick={nextStep}
                    icon={<ArrowRight className="w-4 h-4" />}
                    className="font-bold"
                  >
                    Next Step
                  </Button>
                ) : (
                  <Button
                    type="submit"
                    variant="success"
                    size="lg"
                    loading={loading}
                    icon={<CheckCircle2 className="w-5 h-5" />}
                    className="font-bold bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    Submit Registration
                  </Button>
                )}
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
};
