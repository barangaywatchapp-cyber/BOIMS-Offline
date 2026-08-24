/**
 * Page: InventoryPage (Module 7)
 * Barangay Property & Inventory Asset Management Interface
 * Features:
 * - Asset registry with unique asset code tagging (AST-YYYY-XXXX) and Barcode/QR generation
 * - Asset Borrowing & Issuance workflow (issue to residents/officials, return tracking)
 * - Equipment maintenance schedule & damage reporting
 * - Asset Valuation and stock availability tracking
 * - Role-Based Access Control (Admin, Chairman, Treasurer, Executive Officer)
 * - Offline sync capability
 */

import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { inventoryService } from '../services/inventoryService';
import { storageService } from '../services/storageService';
import { InventoryItem, AssetCategory, AssetCondition, AssetStatus } from '../types';
import { canAccessInventory } from '../utils/permissions';
import { Card, CardHeader, CardTitle, CardContent } from '../components/foundation/Card';
import { Button } from '../components/foundation/Button';
import { Badge } from '../components/foundation/Badge';
import {
  Boxes,
  Plus,
  Search,
  Filter,
  CheckCircle2,
  AlertTriangle,
  QrCode,
  Calendar,
  User,
  MapPin,
  FileText,
  Wrench,
  RotateCcw,
  Upload,
  RefreshCw,
  Eye,
  Tag,
  DollarSign,
  PackageCheck,
  PackageX,
} from 'lucide-react';

export const InventoryPage: React.FC = () => {
  const { user, role, isAuthInitialized } = useAuth();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);

  // Modals state
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [showDetailModal, setShowDetailModal] = useState<boolean>(false);
  const [showBorrowModal, setShowBorrowModal] = useState<boolean>(false);
  const [showMaintenanceModal, setShowMaintenanceModal] = useState<boolean>(false);
  const [showQrModal, setShowQrModal] = useState<boolean>(false);

  // Upload state
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [imagePreview, setImagePreview] = useState<string>('');

  // Add Item Form State
  const [formData, setFormData] = useState({
    assetName: '',
    category: 'furniture' as AssetCategory,
    description: '',
    brand: '',
    model: '',
    serialNumber: '',
    quantity: 1,
    unit: 'pcs',
    acquisitionDate: new Date().toISOString().slice(0, 10),
    acquisitionCost: 0,
    supplier: '',
    fundingSource: 'Barangay Fund',
    location: 'Barangay Hall Storage',
    condition: 'good' as AssetCondition,
    status: 'available' as AssetStatus,
    remarks: '',
  });

  // Borrow Form State
  const [borrowData, setBorrowData] = useState({
    borrowerName: '',
    borrowerContact: '',
    borrowerAddress: '',
    borrowerRole: 'Resident',
    quantity: 1,
    purpose: '',
    expectedReturnDate: new Date(Date.now() + 86400000 * 3).toISOString().slice(0, 10),
  });

  // Maintenance Form State
  const [maintData, setMaintData] = useState({
    condition: 'good' as AssetCondition,
    status: 'available' as AssetStatus,
    remarks: '',
  });

  const isAuthorized = canAccessInventory(role);
  const canManage = isAuthorized;

  const fetchItems = async () => {
    if (!isAuthorized) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await inventoryService.getInventoryItems();
      setItems(data);
    } catch (err) {
      console.error('Failed to load inventory assets:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isAuthInitialized) return;
    fetchItems();
  }, [isAuthInitialized, role]);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const url = await storageService.uploadImage(file, 'inventory');
      setImagePreview(url);
    } catch (err) {
      alert('Failed to upload image: ' + (err as Error).message);
    } finally {
      setIsUploading(false);
    }
  };

  const handleCreateAsset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    try {
      await inventoryService.createInventoryItem(
        {
          ...formData,
          availableQuantity: formData.quantity,
          imageUrls: imagePreview ? [imagePreview] : ['https://images.unsplash.com/photo-1580481072645-022f9a6d8310?auto=format&fit=crop&q=80&w=600'],
        },
        user.uid
      );
      setShowAddModal(false);
      setImagePreview('');
      fetchItems();
      setFormData({
        assetName: '',
        category: 'furniture',
        description: '',
        brand: '',
        model: '',
        serialNumber: '',
        quantity: 1,
        unit: 'pcs',
        acquisitionDate: new Date().toISOString().slice(0, 10),
        acquisitionCost: 0,
        supplier: '',
        fundingSource: 'Barangay Fund',
        location: 'Barangay Hall Storage',
        condition: 'good',
        status: 'available',
        remarks: '',
      });
    } catch (err) {
      alert('Error creating asset: ' + (err as Error).message);
    }
  };

  const handleIssueBorrow = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItem || !user) return;

    try {
      const updated = await inventoryService.issueBorrowItem(
        selectedItem.assetId,
        {
          borrowerName: borrowData.borrowerName,
          borrowerContact: borrowData.borrowerContact,
          borrowerAddress: borrowData.borrowerAddress,
          borrowerRole: borrowData.borrowerRole,
          quantity: Number(borrowData.quantity),
          purpose: borrowData.purpose,
          expectedReturnDate: borrowData.expectedReturnDate,
        },
        user.uid
      );
      setSelectedItem(updated);
      setShowBorrowModal(false);
      fetchItems();
      alert(`Asset successfully issued to ${borrowData.borrowerName}`);
    } catch (err) {
      alert('Error issuing asset: ' + (err as Error).message);
    }
  };

  const handleReturnItem = async (borrowId: string) => {
    if (!selectedItem || !user) return;

    const remarks = window.prompt('Enter return inspection remarks (e.g., Checked clean and complete):');
    if (remarks === null) return;

    try {
      const updated = await inventoryService.returnBorrowedItem(selectedItem.assetId, borrowId, remarks, user.uid);
      setSelectedItem(updated);
      fetchItems();
      alert('Item return recorded successfully.');
    } catch (err) {
      alert('Error returning item: ' + (err as Error).message);
    }
  };

  const handleUpdateMaintenance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItem || !user) return;

    try {
      const updated = await inventoryService.updateMaintenanceStatus(
        selectedItem.assetId,
        maintData.condition,
        maintData.status,
        maintData.remarks,
        user.uid
      );
      setSelectedItem(updated);
      setShowMaintenanceModal(false);
      fetchItems();
    } catch (err) {
      alert('Error updating maintenance: ' + (err as Error).message);
    }
  };

  const filteredItems = items.filter((item) => {
    const matchesSearch =
      item.assetCode.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.assetName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.brand && item.brand.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (item.location && item.location.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesCategory = categoryFilter === 'all' || item.category === categoryFilter;
    const matchesStatus = statusFilter === 'all' || item.status === statusFilter;

    return matchesSearch && matchesCategory && matchesStatus;
  });

  const totalAssetsCount = items.reduce((acc, curr) => acc + curr.quantity, 0);
  const totalValuation = items.reduce((acc, curr) => acc + (curr.acquisitionCost || 0) * curr.quantity, 0);
  const availableCount = items.reduce((acc, curr) => acc + curr.availableQuantity, 0);
  const borrowedCount = items.reduce((acc, curr) => acc + (curr.quantity - curr.availableQuantity), 0);
  const maintenanceCount = items.filter((item) => item.status === 'maintenance' || item.condition === 'poor' || item.condition === 'damaged').length;

  const getConditionBadge = (cond: AssetCondition) => {
    switch (cond) {
      case 'excellent':
      case 'good':
        return <Badge variant="success">{cond}</Badge>;
      case 'fair':
        return <Badge variant="warning">{cond}</Badge>;
      case 'poor':
      case 'damaged':
      case 'condemned':
        return <Badge variant="danger">{cond}</Badge>;
      default:
        return <Badge variant="neutral">{cond}</Badge>;
    }
  };

  const getStatusBadge = (status: AssetStatus) => {
    switch (status) {
      case 'available':
        return <Badge variant="success" className="flex items-center gap-1"><PackageCheck className="w-3 h-3" /> Available</Badge>;
      case 'borrowed':
        return <Badge variant="warning" className="flex items-center gap-1"><RotateCcw className="w-3 h-3" /> Borrowed</Badge>;
      case 'maintenance':
        return <Badge variant="danger" className="flex items-center gap-1"><Wrench className="w-3 h-3" /> Maintenance</Badge>;
      default:
        return <Badge variant="neutral">{status}</Badge>;
    }
  };

  if (!isAuthorized) {
    return (
      <div className="p-8 max-w-4xl mx-auto">
        <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-center space-y-3">
          <Boxes className="w-12 h-12 text-red-600 mx-auto" />
          <h2 className="text-lg font-bold text-red-900">403 - Access Denied</h2>
          <p className="text-xs text-red-700 max-w-md mx-auto">
            Barangay Property & Inventory Assets is strictly restricted to the Barangay Secretary and Barangay Chairman.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900 text-white p-6 rounded-2xl shadow-lg border border-slate-800">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-blue-600 flex items-center justify-center shrink-0 shadow-md">
            <Boxes className="w-7 h-7 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tight">Barangay Property & Inventory Assets</h1>
            <p className="text-slate-400 text-sm mt-0.5">
              Equipment tracking, borrowing registry, asset valuation, and QR code tag generation
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={fetchItems} className="flex items-center gap-2">
            <RefreshCw className="w-4 h-4" /> Refresh
          </Button>

          {canManage && (
            <Button
              variant="primary"
              size="md"
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-2 shadow-md"
            >
              <Plus className="w-4 h-4" /> Add Asset Item
            </Button>
          )}
        </div>
      </div>

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card className="border-l-4 border-l-blue-600">
          <CardContent className="p-4">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Asset Valuation</p>
            <p className="text-xl font-black text-blue-700 mt-1">
              ₱{totalValuation.toLocaleString('en-PH')}
            </p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-slate-700">
          <CardContent className="p-4">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Quantity</p>
            <p className="text-2xl font-black text-slate-900 mt-1">{totalAssetsCount} <span className="text-xs text-slate-400 font-normal">items</span></p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-emerald-600">
          <CardContent className="p-4">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Available Stock</p>
            <p className="text-2xl font-black text-emerald-600 mt-1">{availableCount}</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-amber-500">
          <CardContent className="p-4">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Currently Borrowed</p>
            <p className="text-2xl font-black text-amber-600 mt-1">{borrowedCount}</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-red-600">
          <CardContent className="p-4">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Maintenance / Damaged</p>
            <p className="text-2xl font-black text-red-600 mt-1">{maintenanceCount}</p>
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
              placeholder="Search asset code, name, brand, or storage location..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="p-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 bg-white"
            >
              <option value="all">All Categories</option>
              <option value="furniture">Furniture & Seating</option>
              <option value="electronics">Electronics & Audio</option>
              <option value="emergencyEquipment">Emergency & Disaster Gear</option>
              <option value="medicalEquipment">Medical & First Aid</option>
              <option value="vehicles">Patrol & Vehicles</option>
              <option value="officeEquipment">Office Equipment</option>
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="p-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 bg-white"
            >
              <option value="all">All Statuses</option>
              <option value="available">Available</option>
              <option value="borrowed">Borrowed</option>
              <option value="maintenance">Maintenance</option>
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Assets Registry Table */}
      <Card>
        <CardHeader className="border-b border-slate-100 pb-3">
          <CardTitle className="text-base font-bold text-slate-900 flex items-center justify-between">
            <span>Barangay Asset Registry</span>
            <span className="text-xs font-normal text-slate-500">Showing {filteredItems.length} items</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-12 text-center text-slate-500 flex flex-col items-center gap-2">
              <RefreshCw className="w-6 h-6 animate-spin text-blue-600" />
              <span>Loading inventory assets...</span>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="p-12 text-center text-slate-500">
              <Boxes className="w-12 h-12 text-slate-300 mx-auto mb-2" />
              <p className="font-semibold">No inventory assets found.</p>
              <p className="text-xs text-slate-400 mt-1">Try adjusting your filter or search query.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    <th className="py-3 px-4">Asset Code</th>
                    <th className="py-3 px-4">Item Name & Brand</th>
                    <th className="py-3 px-4">Quantity (Avail / Total)</th>
                    <th className="py-3 px-4">Location</th>
                    <th className="py-3 px-4">Condition</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {filteredItems.map((item) => (
                    <tr key={item.assetId} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3.5 px-4 font-mono font-bold text-blue-700 text-xs">
                        <div className="flex items-center gap-1.5">
                          <Tag className="w-3.5 h-3.5 text-blue-500" />
                          {item.assetCode}
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-900">{item.assetName}</div>
                        <div className="text-xs text-slate-500">
                          {item.brand ? `${item.brand} ${item.model || ''}` : item.category}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-xs font-bold">
                        <span className="text-emerald-700">{item.availableQuantity}</span> / <span className="text-slate-600">{item.quantity} {item.unit}</span>
                      </td>
                      <td className="py-3.5 px-4 text-xs text-slate-600">
                        <div className="flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span className="truncate max-w-[180px]">{item.location}</span>
                        </div>
                      </td>
                      <td className="py-3.5 px-4">{getConditionBadge(item.condition)}</td>
                      <td className="py-3.5 px-4">{getStatusBadge(item.status)}</td>
                      <td className="py-3.5 px-4 text-right">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            setSelectedItem(item);
                            setShowDetailModal(true);
                          }}
                          className="flex items-center gap-1 text-xs"
                        >
                          <Eye className="w-3.5 h-3.5" /> Details & QR
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Asset Detail & Borrowing History Modal */}
      {showDetailModal && selectedItem && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 bg-slate-900 text-white rounded-t-2xl flex justify-between items-center">
              <div>
                <span className="text-xs font-mono text-blue-400 font-bold">{selectedItem.assetCode}</span>
                <h2 className="text-xl font-black">{selectedItem.assetName}</h2>
              </div>
              <button
                onClick={() => setShowDetailModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-6 text-sm text-slate-700">
              {/* Asset Header Info */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
                <div>
                  <p className="text-xs font-bold text-slate-400 uppercase">Available / Total</p>
                  <p className="font-bold text-slate-900 text-base mt-0.5">
                    {selectedItem.availableQuantity} / {selectedItem.quantity} {selectedItem.unit}
                  </p>
                </div>

                <div>
                  <p className="text-xs font-bold text-slate-400 uppercase">Acquisition Cost</p>
                  <p className="font-bold text-slate-900 text-base mt-0.5">
                    ₱{(selectedItem.acquisitionCost || 0).toLocaleString('en-PH')}
                  </p>
                </div>

                <div>
                  <p className="text-xs font-bold text-slate-400 uppercase">Condition</p>
                  <div className="mt-1">{getConditionBadge(selectedItem.condition)}</div>
                </div>

                <div>
                  <p className="text-xs font-bold text-slate-400 uppercase">Status</p>
                  <div className="mt-1">{getStatusBadge(selectedItem.status)}</div>
                </div>
              </div>

              {/* Description & Details */}
              <div className="space-y-2">
                <h3 className="font-bold text-slate-900 text-xs uppercase tracking-wider">Asset Information</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  <div>
                    <p><strong>Brand / Model:</strong> {selectedItem.brand || 'N/A'} {selectedItem.model || ''}</p>
                    <p><strong>Serial Number:</strong> {selectedItem.serialNumber || 'N/A'}</p>
                    <p><strong>Storage Location:</strong> {selectedItem.location}</p>
                    <p><strong>Funding Source:</strong> {selectedItem.fundingSource || 'Barangay Fund'}</p>
                  </div>
                  <div>
                    <p><strong>Acquisition Date:</strong> {selectedItem.acquisitionDate || 'N/A'}</p>
                    <p><strong>Supplier:</strong> {selectedItem.supplier || 'N/A'}</p>
                    <p><strong>QR Code Tag:</strong> {selectedItem.qrCode}</p>
                    <p><strong>Barcode:</strong> {selectedItem.barcode}</p>
                  </div>
                </div>
                {selectedItem.description && (
                  <p className="text-xs text-slate-600 bg-slate-50 p-2.5 rounded-lg border mt-2">
                    {selectedItem.description}
                  </p>
                )}
              </div>

              {/* Borrowing History */}
              <div>
                <div className="flex justify-between items-center mb-2">
                  <h3 className="font-bold text-slate-900 text-xs uppercase tracking-wider">
                    Borrowing & Issuance History
                  </h3>
                  {canManage && selectedItem.availableQuantity > 0 && (
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => setShowBorrowModal(true)}
                      className="text-xs flex items-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" /> Issue / Borrow Asset
                    </Button>
                  )}
                </div>

                {(!selectedItem.borrowingHistory || selectedItem.borrowingHistory.length === 0) ? (
                  <p className="text-xs text-slate-400 italic bg-slate-50 p-3 rounded-lg">No borrowing history recorded.</p>
                ) : (
                  <div className="space-y-3">
                    {selectedItem.borrowingHistory.map((b) => (
                      <div key={b.borrowId} className="p-3.5 border border-slate-200 rounded-xl bg-white space-y-1">
                        <div className="flex justify-between items-center">
                          <span className="font-bold text-slate-900 text-xs">{b.borrowerName} ({b.borrowerRole})</span>
                          {b.status === 'active' ? (
                            <Badge variant="warning">Active Loan</Badge>
                          ) : (
                            <Badge variant="success">Returned</Badge>
                          )}
                        </div>
                        <p className="text-xs text-slate-600">
                          <strong>Purpose:</strong> {b.purpose} | <strong>Qty:</strong> {b.quantity} {selectedItem.unit}
                        </p>
                        <p className="text-xs text-slate-500">
                          Borrowed: {new Date(b.borrowedAt).toLocaleDateString()} | Expected Return: {b.expectedReturnDate}
                        </p>

                        {b.status === 'active' && canManage && (
                          <div className="pt-2 flex justify-end">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleReturnItem(b.borrowId)}
                              className="text-xs flex items-center gap-1"
                            >
                              <RotateCcw className="w-3.5 h-3.5" /> Mark Returned
                            </Button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Actions Footer */}
              <div className="flex flex-wrap gap-2 pt-4 border-t border-slate-200 justify-between items-center">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowQrModal(true)}
                  className="flex items-center gap-1 text-xs"
                >
                  <QrCode className="w-4 h-4" /> View Asset QR Tag
                </Button>

                <div className="flex gap-2">
                  {canManage && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setMaintData({
                          condition: selectedItem.condition,
                          status: selectedItem.status,
                          remarks: selectedItem.remarks || '',
                        });
                        setShowMaintenanceModal(true);
                      }}
                      className="flex items-center gap-1 text-xs"
                    >
                      <Wrench className="w-3.5 h-3.5" /> Update Maintenance
                    </Button>
                  )}
                  <Button variant="secondary" size="sm" onClick={() => setShowDetailModal(false)}>
                    Close
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Issue / Borrow Asset Modal */}
      {showBorrowModal && selectedItem && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <RotateCcw className="w-5 h-5 text-blue-600" /> Issue / Borrow Asset
            </h3>
            <p className="text-xs text-slate-500">
              Issuing <strong>{selectedItem.assetName}</strong> (Available: {selectedItem.availableQuantity} {selectedItem.unit})
            </p>

            <form onSubmit={handleIssueBorrow} className="space-y-3 text-sm">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Borrower Full Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Senior Citizens Club / Juan Dela Cruz"
                  value={borrowData.borrowerName}
                  onChange={(e) => setBorrowData({ ...borrowData, borrowerName: e.target.value })}
                  className="w-full p-2 border border-slate-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Contact Number *</label>
                <input
                  type="text"
                  required
                  placeholder="0917-000-0000"
                  value={borrowData.borrowerContact}
                  onChange={(e) => setBorrowData({ ...borrowData, borrowerContact: e.target.value })}
                  className="w-full p-2 border border-slate-300 rounded-lg"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Quantity *</label>
                  <input
                    type="number"
                    min={1}
                    max={selectedItem.availableQuantity}
                    required
                    value={borrowData.quantity}
                    onChange={(e) => setBorrowData({ ...borrowData, quantity: Number(e.target.value) })}
                    className="w-full p-2 border border-slate-300 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Return Date *</label>
                  <input
                    type="date"
                    required
                    value={borrowData.expectedReturnDate}
                    onChange={(e) => setBorrowData({ ...borrowData, expectedReturnDate: e.target.value })}
                    className="w-full p-2 border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Borrowing Purpose *</label>
                <textarea
                  rows={2}
                  required
                  placeholder="e.g., Weekly community health assembly"
                  value={borrowData.purpose}
                  onChange={(e) => setBorrowData({ ...borrowData, purpose: e.target.value })}
                  className="w-full p-2 border border-slate-300 rounded-lg"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="secondary" size="sm" onClick={() => setShowBorrowModal(false)}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary" size="sm">
                  Confirm Borrow Issue
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add New Asset Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-5 bg-slate-900 text-white rounded-t-2xl flex justify-between items-center">
              <h3 className="font-bold text-lg flex items-center gap-2">
                <Boxes className="w-5 h-5 text-blue-400" /> Add Barangay Property / Asset
              </h3>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-white text-lg">
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateAsset} className="p-6 space-y-4 text-sm">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Asset Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g., Monobloc Chairs (Blue)"
                    value={formData.assetName}
                    onChange={(e) => setFormData({ ...formData, assetName: e.target.value })}
                    className="w-full p-2 border border-slate-300 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Category *</label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value as AssetCategory })}
                    className="w-full p-2 border border-slate-300 rounded-lg"
                  >
                    <option value="furniture">Furniture & Seating</option>
                    <option value="electronics">Electronics & Audio</option>
                    <option value="emergencyEquipment">Emergency & Disaster Gear</option>
                    <option value="medicalEquipment">Medical & First Aid</option>
                    <option value="vehicles">Patrol & Vehicles</option>
                    <option value="officeEquipment">Office Equipment</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Quantity *</label>
                  <input
                    type="number"
                    min={1}
                    required
                    value={formData.quantity}
                    onChange={(e) => setFormData({ ...formData, quantity: Number(e.target.value) })}
                    className="w-full p-2 border border-slate-300 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Unit *</label>
                  <input
                    type="text"
                    required
                    placeholder="pcs, units, sets"
                    value={formData.unit}
                    onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                    className="w-full p-2 border border-slate-300 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Unit Cost (₱)</label>
                  <input
                    type="number"
                    min={0}
                    value={formData.acquisitionCost}
                    onChange={(e) => setFormData({ ...formData, acquisitionCost: Number(e.target.value) })}
                    className="w-full p-2 border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Brand / Model</label>
                  <input
                    type="text"
                    placeholder="e.g., Uratex Classic"
                    value={formData.brand}
                    onChange={(e) => setFormData({ ...formData, brand: e.target.value })}
                    className="w-full p-2 border border-slate-300 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Storage Location *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Barangay Storage Room A"
                    value={formData.location}
                    onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                    className="w-full p-2 border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Description / Asset Remarks</label>
                <textarea
                  rows={2}
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full p-2 border border-slate-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Asset Photo</label>
                <input type="file" accept="image/*" onChange={handleImageUpload} className="text-xs" />
                {isUploading && <p className="text-xs text-blue-600 mt-1">Uploading photo...</p>}
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
                <Button type="button" variant="secondary" size="sm" onClick={() => setShowAddModal(false)}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary" size="sm">
                  Save Asset Item
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* QR Code Tag Modal */}
      {showQrModal && selectedItem && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4 text-center">
            <h3 className="text-lg font-bold text-slate-900">Official Asset QR Tag</h3>
            <div className="p-6 bg-slate-50 border-2 border-dashed border-slate-300 rounded-xl inline-block">
              <QrCode className="w-32 h-32 text-slate-900 mx-auto" />
              <p className="font-mono text-xs font-bold text-blue-700 mt-3">{selectedItem.qrCode}</p>
              <p className="text-xs font-bold text-slate-800 mt-1">{selectedItem.assetName}</p>
              <p className="text-[10px] text-slate-500 uppercase">{selectedItem.location}</p>
            </div>
            <div className="flex justify-center gap-2">
              <Button variant="secondary" size="sm" onClick={() => setShowQrModal(false)}>
                Close
              </Button>
              <Button variant="primary" size="sm" onClick={() => window.print()}>
                Print Tag
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
