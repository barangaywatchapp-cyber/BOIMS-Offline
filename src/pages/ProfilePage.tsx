/**
 * Page: ProfilePage (Module 2)
 * Allows users to view profile details, contact information, role permissions,
 * and update their password using authService.
 */

import React, { useState, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { authService } from '../services/authService';
import { storageService, validateProfileImage } from '../services/storageService';
import { ROLE_LABELS, APP_METADATA } from '../constants';
import { PageContainer } from '../components/layout/PageContainer';
import { Avatar } from '../components/foundation/Avatar';
import { FormField } from '../components/forms/FormField';
import { TextInput } from '../components/forms/TextInput';
import { PasswordInput } from '../components/forms/PasswordInput';
import { Button } from '../components/foundation/Button';
import { Alert } from '../components/feedback/Alert';
import { Badge } from '../components/foundation/Badge';
import { BoimsQrCodeCard } from '../components/foundation/BoimsQrCodeCard';
import {
  User as UserIcon,
  Mail,
  Phone,
  MapPin,
  Shield,
  KeyRound,
  CheckCircle2,
  Lock,
  Building,
  Camera,
  Upload,
  Trash2,
  Loader2,
  QrCode,
} from 'lucide-react';

export const ProfilePage: React.FC = () => {
  const { user, role } = useAuth();
  const { showToast } = useToast();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState<boolean>(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [photoError, setPhotoError] = useState<string>('');

  const roleInfo = role ? ROLE_LABELS[role] : null;

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    setPhotoError('');

    try {
      validateProfileImage(file);
    } catch (err: any) {
      const errorMsg = err.message || 'Invalid image file.';
      setPhotoError(errorMsg);
      showToast(errorMsg, 'error');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setUploading(true);
    setUploadProgress(0);

    try {
      const photoUrl = await storageService.uploadProfilePhoto(
        user.uid,
        file,
        (progress) => setUploadProgress(progress)
      );

      await authService.updateProfilePhoto(user.uid, photoUrl);
      showToast('Profile photo updated successfully!', 'success');
    } catch (err: any) {
      console.error('Failed to upload profile photo:', err);
      const msg = err.message || 'Failed to upload profile photo. Please try again.';
      setPhotoError(msg);
      showToast(msg, 'error');
    } finally {
      setUploading(false);
      setUploadProgress(0);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRemovePhoto = async () => {
    if (!user) return;
    if (!window.confirm('Are you sure you want to remove your profile photo?')) return;

    setUploading(true);
    setPhotoError('');

    try {
      await authService.removeProfilePhoto(user.uid, user.profilePicture);
      showToast('Profile photo removed successfully.', 'success');
    } catch (err: any) {
      console.error('Failed to remove profile photo:', err);
      const msg = err.message || 'Failed to remove profile photo.';
      setPhotoError(msg);
      showToast(msg, 'error');
    } finally {
      setUploading(false);
    }
  };

  // Change Password state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordError, setPasswordError] = useState('');

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPassword || !newPassword || !confirmPassword) {
      setPasswordError('Please fill out all password fields.');
      return;
    }

    if (newPassword.length < 8) {
      setPasswordError('New password must be at least 8 characters long.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError('New passwords do not match.');
      return;
    }

    setPasswordError('');
    setPasswordLoading(true);

    try {
      await authService.changePassword(currentPassword, newPassword);
      showToast('Password changed successfully!', 'success');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      setPasswordError(err.message || 'Failed to update password.');
    } finally {
      setPasswordLoading(false);
    }
  };

  return (
    <PageContainer
      title="User Profile & Account Settings"
      description="View your active persona, system permissions, and manage account security"
    >
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: User Summary Card */}
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-2xs space-y-6 text-center">
            <div className="flex flex-col items-center">
              <div className="relative group inline-block">
                <Avatar
                  name={user?.fullName || 'User'}
                  src={user?.profilePicture}
                  size="xl"
                  className="shadow-md border-2 border-slate-200"
                />
                {uploading && (
                  <div className="absolute inset-0 bg-slate-900/60 rounded-full flex flex-col items-center justify-center text-white text-xs font-bold p-1">
                    <Loader2 className="w-5 h-5 animate-spin mb-0.5 text-blue-400" />
                    <span>{uploadProgress > 0 ? `${uploadProgress}%` : 'Saving...'}</span>
                  </div>
                )}
              </div>

              <h2 className="text-xl font-bold text-slate-900 mt-3 tracking-tight">{user?.fullName}</h2>
              <p className="text-xs text-slate-500">{user?.email}</p>

              {/* Hidden File Input */}
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileSelect}
                accept="image/jpeg,image/png,image/webp,image/jpg"
                className="hidden"
              />

              {/* Photo Action Buttons */}
              <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                {user?.profilePicture ? (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading}
                      icon={<Camera className="w-3.5 h-3.5" />}
                      className="text-xs"
                    >
                      Change Photo
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={handleRemovePhoto}
                      disabled={uploading}
                      icon={<Trash2 className="w-3.5 h-3.5 text-rose-600" />}
                      className="text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                    >
                      Remove
                    </Button>
                  </>
                ) : (
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    icon={<Upload className="w-3.5 h-3.5" />}
                    className="text-xs bg-blue-700 hover:bg-blue-800 text-white"
                  >
                    Upload Photo
                  </Button>
                )}
              </div>

              {photoError && (
                <p className="text-xs text-rose-600 mt-2 font-medium">{photoError}</p>
              )}

              <div className="mt-3 inline-flex items-center gap-2">
                <Badge variant="primary" icon={<Shield className="w-3.5 h-3.5 text-blue-700" />}>
                  {roleInfo?.label || user?.role}
                </Badge>
                <Badge variant="success" icon={<CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />}>
                  Active
                </Badge>
              </div>
            </div>

            <div className="border-t border-slate-100 pt-4 text-left text-xs space-y-3">
              <div className="flex items-center gap-3 text-slate-600">
                <Building className="w-4 h-4 text-slate-400 shrink-0" />
                <span>
                  <strong>Jurisdiction:</strong> {APP_METADATA.defaultBarangay}, {APP_METADATA.defaultMunicipality}
                </span>
              </div>
              <div className="flex items-center gap-3 text-slate-600">
                <MapPin className="w-4 h-4 text-slate-400 shrink-0" />
                <span>
                  <strong>Purok / Zone:</strong> {user?.purok || 'Purok 1'}
                </span>
              </div>
              <div className="flex items-center gap-3 text-slate-600">
                <Phone className="w-4 h-4 text-slate-400 shrink-0" />
                <span>
                  <strong>Contact No:</strong> {user?.phoneNumber || '+63 917 123 4567'}
                </span>
              </div>
            </div>
          </div>

          {/* Role Responsibilities */}
          <div className="bg-blue-50/70 p-6 rounded-2xl border border-blue-200/80 space-y-3">
            <h3 className="font-bold text-sm text-blue-900 flex items-center gap-2">
              <Shield className="w-4 h-4 text-blue-700" />
              Role Authority Level {roleInfo?.level || 1}
            </h3>
            <p className="text-xs text-blue-800 leading-relaxed">{roleInfo?.description}</p>
          </div>

          {/* BOIMS ID & QR Code Card */}
          {user?.boimsId ? (
            <BoimsQrCodeCard
              boimsId={user.boimsId}
              userName={user.fullName}
              userRole={ROLE_LABELS[user.role]?.label || user.role}
              purok={user.purok}
            />
          ) : (
            <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-2xs py-8 flex flex-col items-center justify-center space-y-2 text-slate-400 text-center">
              <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
              <p className="text-xs font-medium text-slate-500">Assigning BOIMS ID...</p>
              <p className="text-[11px] text-slate-400">Your unique identifier is being processed</p>
            </div>
          )}
        </div>

        {/* Right Column: Profile Information & Security Forms */}
        <div className="lg:col-span-8 space-y-8">
          {/* Information Overview */}
          <div className="bg-white p-6 sm:p-8 rounded-2xl border border-slate-200/80 shadow-2xs space-y-6">
            <div className="border-b border-slate-100 pb-4">
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <UserIcon className="w-5 h-5 text-blue-700" />
                Personal Details
              </h3>
              <p className="text-xs text-slate-500 mt-1">Information on record with Barangay System Administration</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField label="First Name">
                <TextInput value={user?.firstName || ''} readOnly disabled />
              </FormField>

              <FormField label="Last Name">
                <TextInput value={user?.lastName || ''} readOnly disabled />
              </FormField>

              <FormField label="Email Address">
                <TextInput value={user?.email || ''} readOnly disabled prefixIcon={<Mail className="w-4 h-4" />} />
              </FormField>

              <FormField label="Phone Number">
                <TextInput value={user?.phoneNumber || ''} readOnly disabled prefixIcon={<Phone className="w-4 h-4" />} />
              </FormField>

              <FormField label="Full Address" className="sm:col-span-2">
                <TextInput value={user?.address || ''} readOnly disabled prefixIcon={<MapPin className="w-4 h-4" />} />
              </FormField>
            </div>
          </div>

          {/* Change Password Form */}
          <div className="bg-white p-6 sm:p-8 rounded-2xl border border-slate-200/80 shadow-2xs space-y-6">
            <div className="border-b border-slate-100 pb-4">
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <KeyRound className="w-5 h-5 text-blue-700" />
                Change Account Password
              </h3>
              <p className="text-xs text-slate-500 mt-1">Ensure your password is at least 8 characters long</p>
            </div>

            {passwordError && <Alert type="error">{passwordError}</Alert>}

            <form onSubmit={handleChangePassword} className="space-y-4">
              <FormField label="Current Password" required>
                <PasswordInput
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                />
              </FormField>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField label="New Password" required hint="At least 8 characters">
                  <PasswordInput
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                  />
                </FormField>

                <FormField label="Confirm New Password" required>
                  <PasswordInput
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                  />
                </FormField>
              </div>

              <div className="pt-2">
                <Button
                  type="submit"
                  variant="primary"
                  loading={passwordLoading}
                  icon={<Lock className="w-4 h-4" />}
                >
                  Update Password
                </Button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </PageContainer>
  );
};
