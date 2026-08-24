/**
 * Page: UserManagementPage (Module 8)
 * User Account Management & Role-Based Access Control (RBAC) Interface
 * Features:
 * - Comprehensive user directory (Residents, Staff, Tanods, Officials, Administrators)
 * - Role assignment & account status management (Activate, Suspend, Deactivate)
 * - User account creation for officials and field responders
 * - Role hierarchy verification and audit logging
 */

import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { adminService } from '../services/adminService';
import { formatPresenceDisplay, OFFICIAL_ROLES } from '../services/presenceService';
import { User, UserRole, AccountStatus } from '../types';
import { ROLE_LABELS } from '../constants';
import { Card, CardHeader, CardTitle, CardContent } from '../components/foundation/Card';
import { Button } from '../components/foundation/Button';
import { Badge } from '../components/foundation/Badge';
import { Avatar } from '../components/foundation/Avatar';
import { BoimsQrCodeCard } from '../components/foundation/BoimsQrCodeCard';
import {
  Users,
  UserCheck,
  UserPlus,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  UserCog,
  RefreshCw,
  Mail,
  Phone,
  MapPin,
  Eye,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Lock,
  WifiOff,
} from 'lucide-react';

export const UserManagementPage: React.FC = () => {
  const { user: currentUser, role: currentRole, isAuthInitialized } = useAuth();
  const isOnline = useOnlineStatus();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [showEditModal, setShowEditModal] = useState<boolean>(false);
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [showDetailModal, setShowDetailModal] = useState<boolean>(false);

  // Edit Role/Status state
  const [editRole, setEditRole] = useState<UserRole>('resident');
  const [editStatus, setEditStatus] = useState<AccountStatus>('active');

  // Add User Form state
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phoneNumber: '',
    address: 'Barangay Central',
    purok: 'Purok 1',
    role: 'purokOfficial' as UserRole,
    status: 'active' as AccountStatus,
  });

  const canManageUsers = currentRole === 'superAdmin' || currentRole === 'admin' || currentRole === 'chairman';

  useEffect(() => {
    if (!isAuthInitialized) return;

    setLoading(true);
    const unsubscribe = adminService.subscribeToUsers((data) => {
      setUsers(data);
      setLoading(false);
    }, currentUser);

    return () => {
      unsubscribe();
    };
  }, [isAuthInitialized, currentUser?.uid, currentUser?.role]);

  const handleUpdateRoleStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser || !currentUser) return;

    try {
      await adminService.updateUserRoleAndStatus(
        selectedUser.uid,
        editRole,
        editStatus,
        currentUser.uid,
        currentUser.fullName,
        currentUser.role
      );
      setShowEditModal(false);
      alert(`User account for ${selectedUser.fullName} has been updated.`);
    } catch (err) {
      alert('Error updating user: ' + (err as Error).message);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;

    try {
      if (['verifier', 'secretary', 'chairman', 'admin'].includes(formData.role)) {
        await adminService.createOfficialAccount(
          {
            email: formData.email,
            password: 'TempPassword123!',
            firstName: formData.firstName,
            lastName: formData.lastName,
            role: formData.role as 'verifier' | 'secretary' | 'chairman' | 'admin',
            purok: formData.purok,
          },
          currentUser.uid,
          currentUser.fullName,
          currentUser.role
        );
      } else {
        await adminService.createUserAccount(
          {
            email: formData.email,
            firstName: formData.firstName,
            lastName: formData.lastName,
            fullName: `${formData.firstName} ${formData.lastName}`,
            phoneNumber: formData.phoneNumber,
            address: formData.address,
            purok: formData.purok,
            barangay: 'Barangay Central',
            municipality: 'Baras',
            province: 'Rizal',
            role: formData.role,
            status: formData.status,
            emailVerified: true,
            isActive: formData.status === 'active',
          },
          currentUser.uid,
          currentUser.fullName,
          currentUser.role
        );
      }
      setShowAddModal(false);
      setFormData({
        firstName: '',
        lastName: '',
        email: '',
        phoneNumber: '',
        address: 'Barangay Central',
        purok: 'Purok 1',
        role: 'verifier' as UserRole,
        status: 'active',
      });
      alert('New official account created successfully. The official will be prompted to change their password on first login.');
    } catch (err) {
      alert('Error creating user account: ' + (err as Error).message);
    }
  };

  const filteredUsers = users.filter((u) => {
    const matchesSearch =
      u.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.phoneNumber.includes(searchQuery) ||
      u.purok.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesRole = roleFilter === 'all' || u.role === roleFilter;
    const matchesStatus = statusFilter === 'all' || u.status === statusFilter;

    return matchesSearch && matchesRole && matchesStatus;
  });

  const totalUsersCount = users.length;
  const activeOfficialsCount = users.filter((u) => u.role !== 'resident' && u.status === 'active').length;
  const residentsCount = users.filter((u) => u.role === 'resident').length;
  const pendingOrSuspendedCount = users.filter((u) => u.status === 'pending' || u.status === 'suspended').length;

  const getRoleBadge = (r: UserRole) => {
    switch (r) {
      case 'superAdmin':
        return <Badge variant="primary" className="bg-rose-800 text-white font-bold">Super Admin</Badge>;
      case 'chairman':
        return <Badge variant="primary" className="bg-purple-700 text-white font-bold">Barangay Chairman</Badge>;
      case 'admin':
        return <Badge variant="primary" className="bg-blue-700 text-white font-bold">Admin</Badge>;
      case 'verifier':
        return <Badge variant="warning" className="bg-amber-600 text-white font-bold">Identity Verifier</Badge>;
      case 'secretary':
        return <Badge variant="info" className="bg-indigo-600 text-white">Secretary</Badge>;
      case 'purokOfficial':
        return <Badge variant="info" className="bg-emerald-600 text-white">Sitio/Purok Official</Badge>;
      case 'resident':
      default:
        return <Badge variant="neutral">Resident</Badge>;
    }
  };

  const getStatusBadge = (s: AccountStatus) => {
    switch (s) {
      case 'active':
        return <Badge variant="success" className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Active</Badge>;
      case 'pending':
        return <Badge variant="warning" className="flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Pending</Badge>;
      case 'suspended':
      default:
        return <Badge variant="danger" className="flex items-center gap-1"><Lock className="w-3 h-3" /> Suspended</Badge>;
    }
  };

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Offline Notice Banner */}
      {!isOnline && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 flex items-start gap-3 text-amber-900 shadow-sm">
          <WifiOff className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-xs space-y-1">
            <p className="font-bold text-amber-900">
              Offline User Directory Mode Active
            </p>
            <p className="text-amber-800 leading-relaxed">
              You are currently viewing cached user accounts and official profiles offline. Creating user accounts, changing roles, and modifying account activation status require live network connectivity for authoritative Firebase Auth identity provisioning and audit logging.
            </p>
          </div>
        </div>
      )}

      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900 text-white p-6 rounded-2xl shadow-lg border border-slate-800">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-blue-600 flex items-center justify-center shrink-0 shadow-md">
            <UserCog className="w-7 h-7 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tight">User Account & Access Management</h1>
            <p className="text-slate-400 text-sm mt-0.5">
              Role-Based Access Control (RBAC), Account Activation, and Official Directory
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {canManageUsers && (
            <Button
              variant="primary"
              size="md"
              onClick={() => setShowAddModal(true)}
              disabled={!isOnline}
              className="flex items-center gap-2 shadow-md"
            >
              <UserPlus className="w-4 h-4" /> Add User Account
            </Button>
          )}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border-l-4 border-l-blue-600">
          <CardContent className="p-4">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total User Accounts</p>
            <p className="text-2xl font-black text-slate-900 mt-1">{totalUsersCount}</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-purple-600">
          <CardContent className="p-4">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Active Officials & Staff</p>
            <p className="text-2xl font-black text-purple-700 mt-1">{activeOfficialsCount}</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-emerald-600">
          <CardContent className="p-4">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Registered Residents</p>
            <p className="text-2xl font-black text-emerald-600 mt-1">{residentsCount}</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-amber-500">
          <CardContent className="p-4">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Pending / Suspended</p>
            <p className="text-2xl font-black text-amber-600 mt-1">{pendingOrSuspendedCount}</p>
          </CardContent>
        </Card>
      </div>

      {/* Search & Filter Bar */}
      <Card>
        <CardContent className="p-4 flex flex-col md:flex-row gap-4 justify-between items-center">
          <div className="relative w-full md:w-96">
            <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
            <input
              type="text"
              placeholder="Search user name, email, phone, or purok..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="p-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 bg-white"
            >
              <option value="all">All System Roles</option>
              <option value="chairman">Chairman</option>
              <option value="admin">Admin</option>
              <option value="secretary">Secretary</option>
              <option value="purokOfficial">Sitio/Purok Official</option>
              <option value="resident">Resident</option>
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="p-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 bg-white"
            >
              <option value="all">All Statuses</option>
              <option value="active">Active</option>
              <option value="pending">Pending Verification</option>
              <option value="suspended">Suspended</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
        </CardContent>
      </Card>

      {/* User Accounts Directory Table */}
      <Card>
        <CardHeader className="border-b border-slate-100 pb-3">
          <CardTitle className="text-base font-bold text-slate-900 flex items-center justify-between">
            <span>Barangay System Accounts Directory</span>
            <span className="text-xs font-normal text-slate-500">Showing {filteredUsers.length} users</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-12 text-center text-slate-500 flex flex-col items-center gap-2">
              <RefreshCw className="w-6 h-6 animate-spin text-blue-600" />
              <span>Loading user directory...</span>
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="p-12 text-center text-slate-500">
              <Users className="w-12 h-12 text-slate-300 mx-auto mb-2" />
              <p className="font-semibold">No user accounts found.</p>
              <p className="text-xs text-slate-400 mt-1">Try adjusting your filter or search query.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    <th className="py-3 px-4">User Details</th>
                    <th className="py-3 px-4">Contact & Location</th>
                    <th className="py-3 px-4">Role</th>
                    <th className="py-3 px-4">Presence</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {filteredUsers.map((u) => {
                    const isOfficialUser = OFFICIAL_ROLES.includes(u.role);
                    return (
                      <tr key={u.uid} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-3">
                            <Avatar name={u.fullName} src={u.profilePicture} size="sm" />
                            <div>
                              <div className="font-bold text-slate-900">{u.fullName}</div>
                              <div className="text-xs text-slate-500 flex items-center gap-1">
                                <Mail className="w-3 h-3" /> {u.email}
                              </div>
                            </div>
                          </div>
                        </td>

                        <td className="py-3.5 px-4 text-xs">
                          <div className="text-slate-700 font-medium flex items-center gap-1">
                            <Phone className="w-3 h-3 text-slate-400" /> {u.phoneNumber || 'N/A'}
                          </div>
                          <div className="text-slate-500 flex items-center gap-1 mt-0.5">
                            <MapPin className="w-3 h-3 text-slate-400" /> {u.purok}, {u.barangay}
                          </div>
                        </td>

                        <td className="py-3.5 px-4">{getRoleBadge(u.role)}</td>

                        <td className="py-3.5 px-4 text-xs font-semibold">
                          {isOfficialUser ? (
                            <span>{formatPresenceDisplay(u.presence?.status)}</span>
                          ) : (
                            <span className="text-slate-400 font-normal">N/A (Resident)</span>
                          )}
                        </td>

                        <td className="py-3.5 px-4">{getStatusBadge(u.status)}</td>

                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => {
                              setSelectedUser(u);
                              setShowDetailModal(true);
                            }}
                            className="text-xs flex items-center gap-1"
                          >
                            <Eye className="w-3.5 h-3.5" /> View
                          </Button>

                          {canManageUsers && (
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={!isOnline}
                              onClick={() => {
                                setSelectedUser(u);
                                setEditRole(u.role);
                                setEditStatus(u.status);
                                setShowEditModal(true);
                              }}
                              className="text-xs flex items-center gap-1"
                            >
                              <Shield className="w-3.5 h-3.5" /> Manage Role
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* View User Details Modal */}
      {showDetailModal && selectedUser && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 className="font-bold text-lg text-slate-900">User Profile Details</h3>
              <button onClick={() => setShowDetailModal(false)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>

            <div className="space-y-3 text-sm">
              <div className="flex items-center gap-3 bg-slate-50 p-3 rounded-xl">
                <Avatar name={selectedUser.fullName} src={selectedUser.profilePicture} size="lg" />
                <div>
                  <p className="font-bold text-slate-900 text-base">{selectedUser.fullName}</p>
                  <p className="text-xs text-slate-500">{selectedUser.email}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs bg-slate-50 p-3 rounded-xl border border-slate-200">
                <div>
                  <p className="text-slate-400 uppercase font-bold">Role</p>
                  <div className="mt-1">{getRoleBadge(selectedUser.role)}</div>
                </div>

                <div>
                  <p className="text-slate-400 uppercase font-bold">Status</p>
                  <div className="mt-1">{getStatusBadge(selectedUser.status)}</div>
                </div>
              </div>

              <div className="space-y-1.5 text-xs text-slate-700">
                <p><strong>Phone:</strong> {selectedUser.phoneNumber || 'N/A'}</p>
                <p><strong>Purok & Barangay:</strong> {selectedUser.purok}, {selectedUser.barangay}</p>
                <p><strong>Municipality / Province:</strong> {selectedUser.municipality}, {selectedUser.province}</p>
                <p><strong>Created Date:</strong> {new Date(selectedUser.createdAt).toLocaleDateString()}</p>
                <p><strong>Account UID:</strong> <code className="bg-slate-100 p-1 rounded font-mono text-[10px]">{selectedUser.uid}</code></p>
              </div>

              {selectedUser.boimsId && (
                <div className="pt-2">
                  <BoimsQrCodeCard
                    boimsId={selectedUser.boimsId}
                    userName={selectedUser.fullName}
                    userRole={ROLE_LABELS[selectedUser.role]?.label || selectedUser.role}
                    purok={selectedUser.purok}
                    size={140}
                  />
                </div>
              )}
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-100">
              <Button variant="secondary" size="sm" onClick={() => setShowDetailModal(false)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Manage Role & Status Modal */}
      {showEditModal && selectedUser && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
            <h3 className="font-bold text-lg text-slate-900 flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-blue-600" /> Update Account Role & Access
            </h3>
            <p className="text-xs text-slate-500">
              Managing access for <strong>{selectedUser.fullName}</strong> ({selectedUser.email})
            </p>

            <form onSubmit={handleUpdateRoleStatus} className="space-y-4 text-sm">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Assign Role *</label>
                <select
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value as UserRole)}
                  className="w-full p-2.5 border border-slate-300 rounded-xl bg-white font-medium"
                >
                  <option value="resident">Resident (Standard User)</option>
                  <option value="purokOfficial">Sitio/Purok Official</option>
                  <option value="secretary">Barangay Secretary (Records & Certs)</option>
                  <option value="admin">Administrator (Full Admin Access)</option>
                  <option value="chairman">Barangay Chairman (Executive Authority)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Account Status *</label>
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value as AccountStatus)}
                  className="w-full p-2.5 border border-slate-300 rounded-xl bg-white font-medium"
                >
                  <option value="active">Active (Granted Access)</option>
                  <option value="pending">Pending Verification</option>
                  <option value="suspended">Suspended (Blocked Access)</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>

              <div className="bg-amber-50 p-3 rounded-xl border border-amber-200 text-xs text-amber-800">
                <strong>Audit Note:</strong> Any modifications to user roles or status will be permanently logged in the System Audit Trail.
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <Button type="button" variant="secondary" size="sm" onClick={() => setShowEditModal(false)}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary" size="sm" disabled={!isOnline}>
                  {isOnline ? 'Save Changes' : 'Offline - Changes Disabled'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add User Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <h3 className="font-bold text-lg text-slate-900 flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-blue-600" /> Create Official / Resident Account
            </h3>

            <form onSubmit={handleCreateUser} className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">First Name *</label>
                  <input
                    type="text"
                    required
                    value={formData.firstName}
                    onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                    className="w-full p-2 border border-slate-300 rounded-lg text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Last Name *</label>
                  <input
                    type="text"
                    required
                    value={formData.lastName}
                    onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                    className="w-full p-2 border border-slate-300 rounded-lg text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Email Address *</label>
                <input
                  type="email"
                  required
                  placeholder="e.g. officer@barangaycentral.gov.ph"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full p-2 border border-slate-300 rounded-lg text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Phone Number</label>
                  <input
                    type="text"
                    placeholder="0917-000-0000"
                    value={formData.phoneNumber}
                    onChange={(e) => setFormData({ ...formData, phoneNumber: e.target.value })}
                    className="w-full p-2 border border-slate-300 rounded-lg text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Purok</label>
                  <input
                    type="text"
                    value={formData.purok}
                    onChange={(e) => setFormData({ ...formData, purok: e.target.value })}
                    className="w-full p-2 border border-slate-300 rounded-lg text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Role Assignment *</label>
                  <select
                    value={formData.role}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value as UserRole })}
                    className="w-full p-2 border border-slate-300 rounded-lg text-sm font-semibold"
                  >
                    <option value="verifier">Identity Verifier</option>
                    <option value="secretary">Secretary</option>
                    <option value="chairman">Barangay Chairman</option>
                    <option value="admin">Administrator</option>
                    <option value="purokOfficial">Sitio/Purok Official</option>
                    <option value="resident">Resident</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Status *</label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value as AccountStatus })}
                    className="w-full p-2 border border-slate-300 rounded-lg text-sm"
                  >
                    <option value="active">Active</option>
                    <option value="pending">Pending</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <Button type="button" variant="secondary" size="sm" onClick={() => setShowAddModal(false)}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary" size="sm" disabled={!isOnline}>
                  {isOnline ? 'Create User' : 'Offline - Account Creation Disabled'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
