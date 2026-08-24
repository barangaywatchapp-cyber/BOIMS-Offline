/**
 * Page: AnnouncementsListPage (Module 5)
 * Community Announcements Board, Emergency Alert Broadcasting, and Category Management.
 * Aligned with Module 5 SRS specifications and UDS design tokens.
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { announcementService } from '../services/announcementService';
import { notificationService } from '../services/notificationService';
import { storageService } from '../services/storageService';
import { isResidentMode, canCreateAnnouncements } from '../utils/permissions';
import {
  Announcement,
  AnnouncementCategory,
  AnnouncementAudience,
  AnnouncementStatus,
  ReportPriority,
} from '../types';
import { APP_METADATA, DEFAULT_EMERGENCY_HOTLINES } from '../constants';
import {
  Megaphone,
  AlertTriangle,
  Pin,
  Search,
  Filter,
  Plus,
  Calendar,
  User,
  Shield,
  Upload,
  Check,
  X,
  Trash2,
  Edit,
  Eye,
  Bell,
  FileText,
  Phone,
  Sparkles,
  Loader2,
  ChevronDown,
  Layers,
  Image as ImageIcon,
} from 'lucide-react';

const CATEGORY_OPTIONS: { id: AnnouncementCategory | 'all'; label: string; icon: string }[] = [
  { id: 'all', label: 'All Categories', icon: '📢' },
  { id: 'emergency', label: 'Emergency Alerts', icon: '🚨' },
  { id: 'advisory', label: 'Public Advisories', icon: '⚠️' },
  { id: 'health', label: 'Health & Medical', icon: '🩺' },
  { id: 'publicSafety', label: 'Public Safety', icon: '🛡️' },
  { id: 'ordinance', label: 'Barangay Ordinances', icon: '📜' },
  { id: 'event', label: 'Community Events', icon: '🎉' },
  { id: 'general', label: 'General Updates', icon: 'ℹ️' },
];

export const AnnouncementsListPage: React.FC = () => {
  const { user, role, isAuthInitialized } = useAuth();

  const [baseAnnouncements, setBaseAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedCategory, setSelectedCategory] = useState<AnnouncementCategory | 'all'>('all');
  const [selectedAudience, setSelectedAudience] = useState<AnnouncementAudience | 'all'>('all');
  const [selectedStatus, setSelectedStatus] = useState<AnnouncementStatus | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState<string>('');

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 350);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Modals & Drawers
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [showDetailModal, setShowDetailModal] = useState<boolean>(false);
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<Announcement | null>(null);
  const [showEmergencyHotlines, setShowEmergencyHotlines] = useState<boolean>(false);

  // Form State
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState<AnnouncementCategory>('general');
  const [audience, setAudience] = useState<AnnouncementAudience>('all');
  const [priority, setPriority] = useState<ReportPriority>('medium');
  const [isPinned, setIsPinned] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const isResident = isResidentMode(user, role);
  const canPost = canCreateAnnouncements(role);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isAuthInitialized) return;
    setLoading(true);
    const unsubscribe = announcementService.subscribeToAnnouncements(
      (data) => {
        setBaseAnnouncements(data);
        setLoading(false);
      },
      {
        userRole: role,
        user: user,
      }
    );

    return () => {
      unsubscribe();
    };
  }, [isAuthInitialized, role, user?.uid]);

  // Derived presentation-filtered list from base Firestore subscription
  const announcements = useMemo(() => {
    let list = [...baseAnnouncements];

    if (selectedCategory !== 'all') {
      list = list.filter((a) => a.category === selectedCategory);
    }

    if (selectedAudience !== 'all') {
      list = list.filter((a) => a.audience === selectedAudience);
    }

    if (selectedStatus !== 'all') {
      list = list.filter((a) => a.status === selectedStatus);
    } else if (isResident) {
      list = list.filter((a) => a.status === 'published');
    }

    if (debouncedSearchQuery.trim() !== '') {
      const q = debouncedSearchQuery.toLowerCase();
      list = list.filter(
        (a) =>
          a.title.toLowerCase().includes(q) ||
          a.content.toLowerCase().includes(q) ||
          a.category.toLowerCase().includes(q)
      );
    }

    return list;
  }, [baseAnnouncements, selectedCategory, selectedAudience, selectedStatus, isResident, debouncedSearchQuery]);

  // Identify active emergency alert
  const criticalEmergency = announcements.find(
    (a) => a.category === 'emergency' && a.priority === 'critical' && a.status === 'published'
  );

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setImageFile(file);
      const reader = new FileReader();
      reader.onload = () => setImagePreview(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleCreateAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canPost) {
      setFormError('Unauthorized: Only Barangay Chairman and Secretary are authorized to post announcements.');
      return;
    }
    if (!title.trim() || !content.trim()) {
      setFormError('Please enter both a title and announcement content.');
      return;
    }

    setSubmitting(true);
    setFormError(null);

    try {
      let coverImageUrl = imagePreview || '';

      // Create initial announcement
      const created = await announcementService.createAnnouncement({
        title,
        content,
        category,
        audience,
        priority,
        coverImage: coverImageUrl,
        isPinned,
        status: 'published',
        createdBy: user?.uid || 'system',
      });

      // Upload cover image if selected
      if (imageFile) {
        coverImageUrl = await storageService.uploadAnnouncementImage(
          imageFile,
          created.announcementId,
          (progress) => setUploadProgress(progress)
        );
        await announcementService.updateAnnouncement(
          created.announcementId,
          { coverImage: coverImageUrl },
          user?.uid || 'system'
        );
      }

      // If emergency / critical, broadcast push notification alert to residents
      if (priority === 'critical' || priority === 'high' || category === 'emergency') {
        await notificationService.createNotification({
          userId: 'all_residents',
          title: `🚨 EMERGENCY BROADCAST: ${title}`,
          message: content.substring(0, 150) + '...',
          type: 'emergency',
          priority: priority,
          link: '/announcements',
          announcementId: created.announcementId,
          createdBy: user?.uid,
        });
      }

      // Reset form & reload
      setTitle('');
      setContent('');
      setCategory('general');
      setAudience('all');
      setPriority('medium');
      setIsPinned(false);
      setImageFile(null);
      setImagePreview(null);
      setUploadProgress(0);
      setShowCreateModal(false);
    } catch (err: any) {
      console.error('Error creating announcement:', err);
      setFormError(err.message || 'Failed to publish announcement. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleTogglePin = async (announcement: Announcement) => {
    if (!canPost) return;
    try {
      await announcementService.togglePinAnnouncement(
        announcement.announcementId,
        !announcement.isPinned,
        user?.uid || 'system'
      );
    } catch (err) {
      console.error('Error toggling pin:', err);
    }
  };

  const handleDelete = async (announcementId: string) => {
    if (!canPost) return;
    if (!window.confirm('Are you sure you want to delete this announcement?')) return;
    try {
      await announcementService.deleteAnnouncement(announcementId, user?.uid || 'system');
    } catch (err) {
      console.error('Error deleting announcement:', err);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-6 rounded-3xl border border-slate-200/80 shadow-2xs">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-blue-100 text-blue-800 rounded-xl">
              <Megaphone className="w-5 h-5" />
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
              Community Announcements & Emergency Alerts
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 font-medium pl-9">
            Official broadcasts, disaster advisories, ordinacial notices, and barangay news.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowEmergencyHotlines(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 text-xs font-bold rounded-2xl transition-all cursor-pointer"
          >
            <Phone className="w-4 h-4 text-red-600 animate-bounce" />
            <span>Emergency Hotlines</span>
          </button>

          {canPost && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-blue-700 hover:bg-blue-800 text-white text-xs font-bold rounded-2xl shadow-sm transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Broadcast Notice</span>
            </button>
          )}
        </div>
      </div>

      {/* Critical Emergency Banner (If active emergency advisory exists) */}
      {criticalEmergency && (
        <div className="bg-gradient-to-r from-red-600 via-red-700 to-amber-700 text-white p-6 rounded-3xl shadow-lg border-2 border-red-400 relative overflow-hidden animate-pulse">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-white/20 rounded-2xl shrink-0">
              <AlertTriangle className="w-8 h-8 text-yellow-300 animate-bounce" />
            </div>
            <div className="space-y-2 flex-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="px-3 py-1 bg-white text-red-700 font-black text-[10px] uppercase rounded-full tracking-wider">
                  🚨 ACTIVE CRITICAL EMERGENCY ADVISORY
                </span>
                <span className="text-xs font-bold text-red-100">
                  Updated: {new Date(criticalEmergency.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <h2 className="text-lg sm:text-xl font-black text-white">{criticalEmergency.title}</h2>
              <p className="text-xs sm:text-sm text-red-100 font-medium line-clamp-3 whitespace-pre-line">
                {criticalEmergency.content}
              </p>
              <div className="pt-2 flex items-center gap-3">
                <button
                  onClick={() => {
                    setSelectedAnnouncement(criticalEmergency);
                    setShowDetailModal(true);
                  }}
                  className="px-4 py-1.5 bg-white text-red-800 hover:bg-red-50 text-xs font-bold rounded-xl shadow-xs transition-all"
                >
                  Read Full Advisory
                </button>
                <button
                  onClick={() => setShowEmergencyHotlines(true)}
                  className="px-4 py-1.5 bg-red-900/60 hover:bg-red-900/80 text-white text-xs font-bold rounded-xl transition-all"
                >
                  Call Rescue Hotline
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Filter & Search Bar */}
      <div className="bg-white p-4 rounded-3xl border border-slate-200/80 shadow-2xs space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Search Box */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
            <input
              type="text"
              placeholder="Search announcements, advisories, ordinances..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-2xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
            />
          </div>

          {/* Audience Filter (For Official Announcement Publishers) */}
          {canPost && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-500">Audience:</span>
              <select
                value={selectedAudience}
                onChange={(e) => setSelectedAudience(e.target.value as any)}
                className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Audiences</option>
                <option value="residents">Residents Only</option>
                <option value="tanod">Tanod / Responders</option>
                <option value="staff">Staff Only</option>
                <option value="barangayOfficials">Barangay Officials</option>
              </select>
            </div>
          )}
        </div>

        {/* Category Pills */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
          {CATEGORY_OPTIONS.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-2xl text-xs font-bold transition-all shrink-0 cursor-pointer ${
                selectedCategory === cat.id
                  ? 'bg-blue-700 text-white shadow-xs'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
              }`}
            >
              <span>{cat.icon}</span>
              <span>{cat.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Announcements List Grid */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-16 bg-white rounded-3xl border border-slate-200/80">
          <Loader2 className="w-8 h-8 text-blue-600 animate-spin mb-3" />
          <p className="text-xs font-bold text-slate-500">Loading community announcements...</p>
        </div>
      ) : announcements.length === 0 ? (
        <div className="bg-white p-12 text-center rounded-3xl border border-slate-200/80 space-y-3">
          <Megaphone className="w-12 h-12 text-slate-300 mx-auto" />
          <h3 className="text-base font-bold text-slate-800">No Announcements Found</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            There are no broadcast announcements matching your current category filter or search terms.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {announcements.map((ann) => {
            const isEmergency = ann.category === 'emergency' || ann.priority === 'critical';
            return (
              <div
                key={ann.announcementId}
                className={`bg-white rounded-3xl border transition-all duration-200 hover:shadow-md flex flex-col justify-between overflow-hidden relative ${
                  ann.isPinned
                    ? 'border-blue-400 ring-2 ring-blue-100 shadow-xs'
                    : isEmergency
                    ? 'border-red-300 bg-red-50/20'
                    : 'border-slate-200/80'
                }`}
              >
                {/* Pinned Badge */}
                {ann.isPinned && (
                  <div className="absolute top-3 right-3 z-10 bg-blue-700 text-white px-2.5 py-1 rounded-full text-[10px] font-bold flex items-center gap-1 shadow-md">
                    <Pin className="w-3 h-3" />
                    <span>PINNED</span>
                  </div>
                )}

                <div>
                  {/* Cover Image Header */}
                  {ann.coverImage ? (
                    <div className="h-44 w-full bg-slate-100 relative overflow-hidden">
                      <img
                        src={ann.coverImage}
                        alt={ann.title}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-slate-900/60 to-transparent" />
                      <div className="absolute bottom-3 left-3 flex items-center gap-2">
                        <span className="px-2.5 py-0.5 bg-white/90 backdrop-blur-sm text-slate-900 text-[10px] font-bold rounded-full uppercase">
                          {ann.category}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div
                      className={`h-28 w-full p-4 flex flex-col justify-end ${
                        isEmergency
                          ? 'bg-gradient-to-r from-red-600 to-amber-600 text-white'
                          : 'bg-gradient-to-r from-blue-700 to-slate-800 text-white'
                      }`}
                    >
                      <span className="px-2.5 py-0.5 bg-white/20 backdrop-blur-sm text-white text-[10px] font-bold rounded-full uppercase w-max">
                        {ann.category}
                      </span>
                    </div>
                  )}

                  {/* Card Content */}
                  <div className="p-5 space-y-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-[11px] text-slate-400 font-semibold">
                        <Calendar className="w-3.5 h-3.5" />
                        <span>{new Date(ann.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                        {ann.audience !== 'all' && (
                          <span className="px-1.5 py-0.2 bg-slate-100 text-slate-700 rounded text-[9px] font-bold uppercase">
                            Target: {ann.audience}
                          </span>
                        )}
                      </div>

                      <h3 className="text-base font-extrabold text-slate-900 leading-snug line-clamp-2">
                        {ann.title}
                      </h3>
                    </div>

                    <p className="text-xs text-slate-600 line-clamp-3 font-medium whitespace-pre-line leading-relaxed">
                      {ann.content}
                    </p>
                  </div>
                </div>

                {/* Footer Controls */}
                <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between">
                  <button
                    onClick={() => {
                      setSelectedAnnouncement(ann);
                      setShowDetailModal(true);
                    }}
                    className="flex items-center gap-1.5 text-xs font-bold text-blue-700 hover:text-blue-900 cursor-pointer"
                  >
                    <Eye className="w-4 h-4" />
                    <span>View Announcement</span>
                  </button>

                  {canPost && (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleTogglePin(ann)}
                        className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                          ann.isPinned
                            ? 'text-blue-700 bg-blue-100 hover:bg-blue-200'
                            : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'
                        }`}
                        title={ann.isPinned ? 'Unpin Announcement' : 'Pin to Top'}
                      >
                        <Pin className="w-4 h-4" />
                      </button>

                      <button
                        onClick={() => handleDelete(ann.announcementId)}
                        className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                        title="Delete Announcement"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Broadcast Announcement Creation Modal */}
      {showCreateModal && canPost && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-2xl w-full border border-slate-200 shadow-2xl p-6 sm:p-8 space-y-6 my-8 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-blue-100 text-blue-800 rounded-xl">
                  <Megaphone className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-900">Broadcast New Announcement</h3>
                  <p className="text-xs text-slate-500 font-medium">
                    Publish official notices to residents or targeted barangay personnel.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-full"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {formError && (
              <div className="p-3 bg-red-50 text-red-800 border border-red-200 rounded-2xl text-xs font-semibold">
                {formError}
              </div>
            )}

            <form onSubmit={handleCreateAnnouncement} className="space-y-4 text-xs font-medium">
              <div>
                <label className="block text-slate-700 font-bold mb-1">
                  Announcement Title <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Scheduled Power Interruption / Free Medical Drive"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">Category</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as any)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="general">General Update</option>
                    <option value="emergency">🚨 Emergency Alert</option>
                    <option value="advisory">⚠️ Public Advisory</option>
                    <option value="health">🩺 Health & Medical</option>
                    <option value="publicSafety">🛡️ Public Safety</option>
                    <option value="ordinance">📜 Barangay Ordinance</option>
                    <option value="event">🎉 Community Event</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">Target Audience</label>
                  <select
                    value={audience}
                    onChange={(e) => setAudience(e.target.value as any)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="all">All Residents & Public</option>
                    <option value="residents">Registered Residents Only</option>
                    <option value="tanod">Barangay Tanod / Responders</option>
                    <option value="staff">Administrative Staff</option>
                    <option value="barangayOfficials">Barangay Officials</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">Priority Level</label>
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as any)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="low">Low Priority</option>
                    <option value="medium">Medium Priority</option>
                    <option value="high">High Priority</option>
                    <option value="critical">🚨 Critical / Emergency</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">
                  Content Details <span className="text-red-500">*</span>
                </label>
                <textarea
                  rows={5}
                  required
                  placeholder="Provide comprehensive details, action steps, affected areas, and contact numbers..."
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 leading-relaxed"
                />
              </div>

              {/* Cover Image Upload */}
              <div>
                <label className="block text-slate-700 font-bold mb-1">Cover Photo / Banner (Optional)</label>
                <div className="flex items-center gap-4">
                  <input
                    type="file"
                    ref={fileInputRef}
                    accept="image/*"
                    onChange={handleImageChange}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl border border-slate-300 transition-all cursor-pointer"
                  >
                    <ImageIcon className="w-4 h-4 text-slate-600" />
                    <span>Choose Banner Image</span>
                  </button>

                  {imagePreview && (
                    <div className="relative w-16 h-12 rounded-lg overflow-hidden border border-slate-200">
                      <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => {
                          setImageFile(null);
                          setImagePreview(null);
                        }}
                        className="absolute top-0 right-0 bg-red-600 text-white p-0.5 rounded-bl"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Pin Toggle */}
              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="isPinned"
                  checked={isPinned}
                  onChange={(e) => setIsPinned(e.target.checked)}
                  className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500 cursor-pointer"
                />
                <label htmlFor="isPinned" className="text-slate-800 font-bold cursor-pointer">
                  Pin this announcement to top of community feed
                </label>
              </div>

              {uploadProgress > 0 && uploadProgress < 100 && (
                <div className="space-y-1">
                  <div className="flex justify-between text-[11px] text-slate-500 font-bold">
                    <span>Uploading Banner Image...</span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                    <div className="bg-blue-600 h-full transition-all" style={{ width: `${uploadProgress}%` }} />
                  </div>
                </div>
              )}

              <div className="pt-4 flex justify-end gap-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex items-center gap-2 px-6 py-2.5 bg-blue-700 hover:bg-blue-800 text-white font-bold rounded-xl shadow-md transition-all disabled:opacity-50"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Publishing Notice...</span>
                    </>
                  ) : (
                    <>
                      <Megaphone className="w-4 h-4" />
                      <span>Broadcast Notice</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Announcement Detail Modal */}
      {showDetailModal && selectedAnnouncement && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-2xl w-full border border-slate-200 shadow-2xl p-6 sm:p-8 space-y-6 my-8 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 bg-blue-100 text-blue-900 text-[10px] font-bold rounded-full uppercase">
                    {selectedAnnouncement.category}
                  </span>
                  {selectedAnnouncement.priority === 'critical' && (
                    <span className="px-2.5 py-0.5 bg-red-100 text-red-800 text-[10px] font-bold rounded-full uppercase">
                      CRITICAL ALERT
                    </span>
                  )}
                </div>
                <h3 className="text-xl font-extrabold text-slate-900">{selectedAnnouncement.title}</h3>
                <p className="text-xs text-slate-500 font-medium">
                  Published on {new Date(selectedAnnouncement.createdAt).toLocaleString()}
                </p>
              </div>
              <button
                onClick={() => setShowDetailModal(false)}
                className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-full shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {selectedAnnouncement.coverImage && (
              <div className="rounded-2xl overflow-hidden max-h-72 w-full bg-slate-100">
                <img
                  src={selectedAnnouncement.coverImage}
                  alt={selectedAnnouncement.title}
                  className="w-full h-full object-cover"
                />
              </div>
            )}

            <div className="prose prose-slate max-w-none text-xs sm:text-sm text-slate-800 leading-relaxed whitespace-pre-line font-serif bg-slate-50 p-5 rounded-2xl border border-slate-200/80">
              {selectedAnnouncement.content}
            </div>

            <div className="pt-4 flex justify-between items-center border-t border-slate-100 text-xs font-semibold text-slate-500">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-blue-700" />
                <span>Issued by Office of the Barangay Chairman</span>
              </div>

              <button
                onClick={() => setShowDetailModal(false)}
                className="px-5 py-2 bg-slate-900 text-white font-bold rounded-xl hover:bg-slate-800"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Emergency Hotlines Modal */}
      {showEmergencyHotlines && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl max-w-md w-full border border-slate-200 shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-red-100 text-red-700 rounded-xl">
                  <Phone className="w-5 h-5" />
                </div>
                <h3 className="text-base font-black text-slate-900">Barangay Emergency Hotlines</h3>
              </div>
              <button
                onClick={() => setShowEmergencyHotlines(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-full"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2">
              {DEFAULT_EMERGENCY_HOTLINES.map((hotline, idx) => (
                <div
                  key={idx}
                  className="p-3 bg-red-50/50 border border-red-100 rounded-2xl flex items-center justify-between text-xs"
                >
                  <div className="space-y-0.5">
                    <p className="font-bold text-slate-900">{hotline.name}</p>
                    <p className="text-red-700 font-extrabold">{hotline.number}</p>
                  </div>
                  <a
                    href={`tel:${hotline.number.split('/')[0].trim()}`}
                    className="px-3 py-1.5 bg-red-600 text-white font-bold rounded-xl text-[11px] hover:bg-red-700 shadow-2xs"
                  >
                    Call Now
                  </a>
                </div>
              ))}
            </div>

            <button
              onClick={() => setShowEmergencyHotlines(false)}
              className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-xl"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
