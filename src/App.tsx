/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import { 
  Plus, 
  Trash2, 
  FileText, 
  Calculator, 
  User, 
  Package, 
  DollarSign,
  Download,
  ClipboardCheck,
  Image as ImageIcon,
  ExternalLink,
  Link as LinkIcon,
  X,
  Search,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  MapPin,
  Edit3,
  Printer,
  Calendar,
  History,
  ArrowLeft,
  AlertTriangle,
  FileSpreadsheet,
  CheckCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  AuctionItem, 
  AuctionSummary, 
  groupAuctionItems,
  SHIPPING_FEE_PER_WINNER
} from './services/auctionService';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import * as XLSX from 'xlsx';
import localforage from 'localforage';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function App() {
  const [items, setItems] = useState<AuctionItem[]>([]);
  const [winnerImages, setWinnerImages] = useState<Record<string, string[]>>({});
  const [winnerStatuses, setWinnerStatuses] = useState<Record<string, { isPaid: boolean, isPrepared: boolean, isShipped: boolean }>>({});
  const [selectedWinner, setSelectedWinner] = useState<AuctionSummary | null>(null);
  const [globalShippingFee, setGlobalShippingFee] = useState(50);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [isEditingModal, setIsEditingModal] = useState(false);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  
  // Form state
  const [newItem, setNewItem] = useState('');
  const [newSubItem, setNewSubItem] = useState('');
  const [newWinner, setNewWinner] = useState('');
  const [newPrice, setNewPrice] = useState('');
  const [newContactLink, setNewContactLink] = useState('');
  const [newAddress, setNewAddress] = useState('');
  const [formImages, setFormImages] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [senderAddress, setSenderAddress] = useState('');
  const [isEditingSender, setIsEditingSender] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [view, setView] = useState<'main' | 'history'>('history');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [allDates, setAllDates] = useState<{ date: string, total: number }[]>([]);
  const [isAddingDate, setIsAddingDate] = useState(false);
  const [tempDate, setTempDate] = useState(new Date().toISOString().split('T')[0]);
  const [deletingDate, setDeletingDate] = useState<string | null>(null);
  const [isClearingAll, setIsClearingAll] = useState(false);
  const [toast, setToast] = useState<{ message: string, type: 'success' | 'error' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const deleteHistoryDate = async (date: string) => {
    try {
      await localforage.removeItem(`auction_items_${date}`);
      await localforage.removeItem(`auction_images_${date}`);
      await localforage.removeItem(`auction_statuses_${date}`);
      await localforage.removeItem(`auction_shipping_fee_${date}`);
      
      // Remove from created dates list
      const createdDates = await localforage.getItem<string[]>('auction_created_dates') || [];
      const updatedDates = createdDates.filter(d => d !== date);
      await localforage.setItem('auction_created_dates', updatedDates);
      
      await loadHistory();
      setDeletingDate(null);
    } catch (err) {
      console.error('Failed to delete history', err);
    }
  };

  // Load all dates for history
  const loadHistory = async () => {
    try {
      const keys = await localforage.keys();
      
      // Get dates from storage keys
      const allPossibleDateKeys = keys.filter(k => 
        k.startsWith('auction_items_') || 
        k.startsWith('auction_images_') || 
        k.startsWith('auction_statuses_')
      );
      
      const storageDates = allPossibleDateKeys.map(k => {
        if (k.startsWith('auction_items_')) return k.replace('auction_items_', '');
        if (k.startsWith('auction_images_')) return k.replace('auction_images_', '');
        if (k.startsWith('auction_statuses_')) return k.replace('auction_statuses_', '');
        return '';
      });

      // Get dates from explicit created list
      const createdDates = await localforage.getItem<string[]>('auction_created_dates') || [];
      
      // Combine and unique
      const uniqueDates = Array.from(new Set([...storageDates, ...createdDates])).filter(d => d !== '');

      const history = await Promise.all(uniqueDates.map(async (date) => {
        const items = await localforage.getItem<AuctionItem[]>(`auction_items_${date}`) || [];
        const total = items.reduce((sum, item) => sum + item.price, 0);
        return { date, total };
      }));
      setAllDates(history.sort((a, b) => b.date.localeCompare(a.date)));
    } catch (err) {
      console.error('Failed to load history', err);
    }
  };

  // Load data on mount or date change
  useEffect(() => {
    const loadData = async () => {
      setIsLoaded(false);
      try {
        const savedItems = await localforage.getItem<AuctionItem[]>(`auction_items_${selectedDate}`);
        setItems(savedItems || []);

        const savedImages = await localforage.getItem<Record<string, string[]>>(`auction_images_${selectedDate}`);
        setWinnerImages(savedImages || {});

        const savedStatuses = await localforage.getItem<Record<string, { isPaid: boolean, isPrepared: boolean, isShipped: boolean }>>(`auction_statuses_${selectedDate}`);
        setWinnerStatuses(savedStatuses || {});

        const savedFee = await localforage.getItem<number>(`auction_shipping_fee_${selectedDate}`);
        setGlobalShippingFee(savedFee !== null ? savedFee : 50);

        const savedSender = await localforage.getItem<string>('auction_sender_address');
        if (savedSender) setSenderAddress(savedSender);
        
        await loadHistory();
      } catch (err) {
        console.error('Failed to load data', err);
      } finally {
        setIsLoaded(true);
      }
    };
    loadData();
  }, [selectedDate]);

  // Save data on change
  useEffect(() => {
    if (!isLoaded) return;
    localforage.setItem(`auction_items_${selectedDate}`, items);
    loadHistory();
  }, [items, isLoaded, selectedDate]);

  useEffect(() => {
    if (!isLoaded) return;
    localforage.setItem(`auction_images_${selectedDate}`, winnerImages);
  }, [winnerImages, isLoaded, selectedDate]);

  useEffect(() => {
    if (!isLoaded) return;
    localforage.setItem(`auction_statuses_${selectedDate}`, winnerStatuses);
  }, [winnerStatuses, isLoaded, selectedDate]);

  useEffect(() => {
    if (!isLoaded) return;
    localforage.setItem(`auction_shipping_fee_${selectedDate}`, globalShippingFee);
  }, [globalShippingFee, isLoaded, selectedDate]);

  useEffect(() => {
    if (!isLoaded) return;
    localforage.setItem('auction_sender_address', senderAddress);
  }, [senderAddress, isLoaded]);

  const summaries = useMemo(() => {
    const grouped = groupAuctionItems(items, globalShippingFee);
    const mapped = grouped.map(s => ({
      ...s,
      images: winnerImages[s.winner] || [],
      status: winnerStatuses[s.winner] || { isPaid: false, isPrepared: false, isShipped: false }
    }));

    if (!searchQuery.trim()) return mapped;
    
    return mapped.filter(s => 
      s.winner.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [items, winnerImages, winnerStatuses, globalShippingFee, searchQuery]);

  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return items;
    return items.filter(item => 
      item.winner.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [items, searchQuery]);

  const grandTotal = useMemo(() => items.reduce((sum, item) => sum + item.price, 0), [items]);

  const toggleStatus = (winner: string, key: 'isPaid' | 'isPrepared' | 'isShipped') => {
    setWinnerStatuses(prev => ({
      ...prev,
      [winner]: {
        ...(prev[winner] || { isPaid: false, isPrepared: false, isShipped: false }),
        [key]: !prev[winner]?.[key]
      }
    }));
  };

  const handleAddItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItem || !newWinner || !newPrice) return;
    
    const price = parseFloat(newPrice);
    if (isNaN(price)) return;

    if (editingIndex !== null) {
      const updatedItems = [...items];
      updatedItems[editingIndex] = {
        mainItem: newItem,
        subItem: newSubItem,
        winner: newWinner,
        price,
        contactLink: newContactLink,
        address: newAddress
      };
      setItems(updatedItems);
      setEditingIndex(null);
    } else {
      setItems([...items, { 
        mainItem: newItem, 
        subItem: newSubItem, 
        winner: newWinner, 
        price,
        contactLink: newContactLink,
        address: newAddress
      }]);
    }
    
    // Add images to the winner
    if (formImages.length > 0) {
      setWinnerImages(prev => ({
        ...prev,
        [newWinner]: [...(prev[newWinner] || []), ...formImages]
      }));
    }
    
    setNewItem('');
    setNewSubItem('');
    setNewWinner('');
    setNewPrice('');
    setNewContactLink('');
    setNewAddress('');
    setFormImages([]);
  };

  const startEditing = (index: number) => {
    const item = items[index];
    setNewItem(item.mainItem);
    setNewSubItem(item.subItem || '');
    setNewWinner(item.winner);
    setNewPrice(item.price.toString());
    setNewContactLink(item.contactLink || '');
    setNewAddress(item.address || '');
    setEditingIndex(index);
    // Scroll to form
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const cancelEditing = () => {
    setEditingIndex(null);
    setNewItem('');
    setNewSubItem('');
    setNewWinner('');
    setNewPrice('');
    setNewContactLink('');
    setNewAddress('');
    setFormImages([]);
  };

  const handleRemoveItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const updateWinnerName = (oldName: string, newName: string) => {
    if (!newName.trim() || oldName === newName) return;
    setItems(prev => prev.map(item => item.winner === oldName ? { ...item, winner: newName } : item));
    setWinnerImages(prev => {
      const next = { ...prev };
      if (next[oldName]) {
        next[newName] = next[oldName];
        delete next[oldName];
      }
      return next;
    });
    setWinnerStatuses(prev => {
      const next = { ...prev };
      if (next[oldName]) {
        next[newName] = next[oldName];
        delete next[oldName];
      }
      return next;
    });
    // Update selectedWinner if it's the one being renamed
    if (selectedWinner && selectedWinner.winner === oldName) {
      setSelectedWinner(prev => prev ? { ...prev, winner: newName } : null);
    }
  };

  const updateItemDetail = (index: number, updates: Partial<AuctionItem>) => {
    setItems(prev => {
      const next = [...prev];
      next[index] = { ...next[index], ...updates };
      return next;
    });
  };

  const updateContactLink = (winner: string, link: string) => {
    setItems(prev => prev.map(item => item.winner === winner ? { ...item, contactLink: link } : item));
  };

  const updateAddress = (winner: string, address: string) => {
    setItems(prev => prev.map(item => item.winner === winner ? { ...item, address: address } : item));
  };

  const handleFormPasteImage = (e: React.ClipboardEvent) => {
    const clipboardItems = e.clipboardData.items;
    for (let i = 0; i < clipboardItems.length; i++) {
      if (clipboardItems[i].type.indexOf('image') !== -1) {
        const blob = clipboardItems[i].getAsFile();
        if (blob) {
          const reader = new FileReader();
          reader.onload = (event) => {
            const base64 = event.target?.result as string;
            setFormImages(prev => [...prev, base64]);
          };
          reader.readAsDataURL(blob);
        }
      }
    }
  };

  const handleFormFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      Array.from(files).forEach(file => {
        const reader = new FileReader();
        reader.onload = (event) => {
          const base64 = event.target?.result as string;
          setFormImages(prev => [...prev, base64]);
        };
        reader.readAsDataURL(file);
      });
    }
  };

  const removeFormImage = (idx: number) => {
    setFormImages(prev => prev.filter((_, i) => i !== idx));
  };

  const handlePasteImage = async (e: React.ClipboardEvent, winner: string) => {
    const clipboardItems = e.clipboardData.items;
    let foundImage = false;
    for (let i = 0; i < clipboardItems.length; i++) {
      if (clipboardItems[i].type.indexOf('image') !== -1) {
        foundImage = true;
        const blob = clipboardItems[i].getAsFile();
        if (blob) {
          const reader = new FileReader();
          reader.onload = (event) => {
            const base64 = event.target?.result as string;
            setWinnerImages(prev => ({
              ...prev,
              [winner]: [...(prev[winner] || []), base64]
            }));
          };
          reader.readAsDataURL(blob);
        }
      }
    }
    if (foundImage) {
      // If we found an image, we should update the selectedWinner state if it's open
      // so the UI reflects the new image immediately
      if (selectedWinner && selectedWinner.winner === winner) {
        // The images in selectedWinner are derived from winnerImages in the next render,
        // but for immediate feedback we can wait for the state update.
      }
    }
  };

  // Update selectedWinner whenever winnerImages or statuses change to keep modal in sync
  useEffect(() => {
    if (selectedWinner) {
      const updated = summaries.find(s => s.winner === selectedWinner.winner);
      if (updated) setSelectedWinner(updated);
    }
  }, [summaries, selectedWinner?.winner]);

  const removeImage = (winner: string, imgIndex: number) => {
    setWinnerImages(prev => ({
      ...prev,
      [winner]: prev[winner].filter((_, i) => i !== imgIndex)
    }));
  };

  const formatSummaryText = (s: AuctionSummary) => {
    const itemsText = s.items.map(i => 
      `- ${i.name}${i.subs.length > 0 ? ` (ย่อย: ${i.subs.join(', ')})` : ''}: ${i.price.toLocaleString()} บาท`
    ).join('\n');
    
    return `📦 สรุปยอดประมูล: ${s.winner}\n\n` +
           `รายการสินค้า:\n${itemsText}\n\n` +
           `💰 ค่าสินค้า: ${s.totalPrice.toLocaleString()} บาท\n` +
           `🚚 ค่าส่ง: ${s.shippingFee} บาท\n` +
           `✅ ยอดโอนรวม: ${s.grandTotal.toLocaleString()} บาท\n\n` +
           `🏦 ช่องทางการชำระเงิน:\n` +
           `พร้อมเพย์ 0955188408\n` +
           `นายศราวุธ ปิ่นทอง\n\n` +
           `โอนแล้วส่งสลิป พร้อมแจ้งที่อยู่ได้เลยครับ จัดส่งภายในวันพรุ่งนี้ครับ`;
  };

  const copyToClipboard = () => {
    const text = summaries.map(s => formatSummaryText(s)).join('\n\n' + '─'.repeat(20) + '\n\n') + `\n\n💰 ยอดรวมทั้งหมดทุกออเดอร์: ${grandTotal.toLocaleString()} บาท (ไม่รวมค่าส่ง)`;
    
    navigator.clipboard.writeText(text);
    showToast('คัดลอกสรุปยอดทั้งหมดแล้ว!');
  };

  const copyAllAddresses = () => {
    if (summaries.length === 0) return;
    
    const senderText = senderAddress ? `ผู้ส่ง\n${senderAddress}` : 'ผู้ส่ง\n(ยังไม่ได้ระบุที่อยู่ผู้ส่ง)';
    
    const addressesText = summaries.map(s => {
      const receiverText = s.address ? `ผู้รับ\n${s.address}` : `ผู้รับ (${s.winner})\n(ยังไม่ได้ระบุที่อยู่)`;
      return `${senderText}\n\n${receiverText}`;
    }).join('\n\n' + '-'.repeat(27) + '\n\n');
    
    navigator.clipboard.writeText(addressesText);
    showToast('คัดลอกที่อยู่ทั้งหมดแล้ว!');
  };

  const exportToExcel = () => {
    if (summaries.length === 0) return;

    const data: any[] = [];
    
    summaries.forEach(s => {
      // Add a header row for the winner
      data.push({
        'ผู้ชนะ': s.winner,
        'ช่องทางติดต่อ': s.contactLink || '-',
        'ที่อยู่': s.address || '-',
        'รายการ': '',
        'ย่อย': '',
        'ราคา': '',
        'ค่าส่ง': s.shippingFee,
        'ยอดโอนรวม': s.grandTotal,
        'สถานะจ่ายเงิน': s.status?.isPaid ? 'จ่ายแล้ว' : 'ยังไม่จ่าย',
        'สถานะเตรียมของ': s.status?.isPrepared ? 'เตรียมแล้ว' : 'ยังไม่เตรียม',
        'สถานะจัดส่ง': s.status?.isShipped ? 'ส่งแล้ว' : 'ยังไม่ส่ง'
      });

      // Add each item for this winner
      items.filter(item => item.winner === s.winner).forEach(item => {
        data.push({
          'ผู้ชนะ': '',
          'ช่องทางติดต่อ': '',
          'ที่อยู่': '',
          'รายการ': item.mainItem,
          'ย่อย': item.subItem || '-',
          'ราคา': item.price,
          'ค่าส่ง': '',
          'ยอดโอนรวม': '',
          'สถานะจ่ายเงิน': '',
          'สถานะเตรียมของ': '',
          'สถานะจัดส่ง': ''
        });
      });

      // Add an empty row for spacing
      data.push({});
    });

    // Add grand total of all items at the end
    data.push({
      'ผู้ชนะ': 'ยอดรวมทั้งหมด (ไม่รวมค่าส่ง)',
      'ราคา': grandTotal
    });

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "สรุปยอดประมูล");
    
    // Generate filename with current date
    const date = new Date().toLocaleDateString('th-TH').replace(/\//g, '-');
    XLSX.writeFile(wb, `สรุปยอดประมูล_${date}.xlsx`);
  };

  const copyWinnerSummary = (s: AuctionSummary) => {
    const text = formatSummaryText(s);
    navigator.clipboard.writeText(text);
    showToast(`คัดลอกสรุปยอดของ ${s.winner} แล้ว!`);
  };

  const copyImageToClipboard = async (base64: string) => {
    try {
      const response = await fetch(base64);
      const blob = await response.blob();
      await navigator.clipboard.write([
        new ClipboardItem({
          [blob.type]: blob
        })
      ]);
      showToast('คัดลอกรูปภาพแล้ว!');
    } catch (err) {
      console.error(err);
      showToast('เบราว์เซอร์ของคุณไม่รองรับการคัดลอกรูปภาพโดยตรง กรุณาบันทึกรูปแทน', 'error');
    }
  };

  if (!isLoaded) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-slate-500 font-medium">กำลังโหลดข้อมูล...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="min-h-screen bg-slate-50 p-4 md:p-8 print:hidden">
        <div className="max-w-5xl mx-auto space-y-8">
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-3xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
                {view === 'main' && (
                  <button 
                    onClick={() => setView('history')}
                    className="p-2 -ml-2 hover:bg-slate-100 rounded-xl transition-colors text-slate-400 hover:text-indigo-600"
                    title="กลับหน้าประวัติ"
                  >
                    <ArrowLeft className="w-6 h-6" />
                  </button>
                )}
                <Calculator className="w-8 h-8 text-indigo-600" />
                ระบบสรุปยอดประมูล
              </h1>
              {view === 'main' && (
                <div className="px-3 py-1 bg-indigo-50 text-indigo-700 rounded-full text-sm font-bold border border-indigo-100 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5" />
                  {new Date(selectedDate).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })}
                </div>
              )}
            </div>
            <p className="text-slate-500">จัดการและสรุปผลการประมูลอย่างรวดเร็ว (Offline 100%)</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {view === 'main' && (
              <>
                {/* Shipping Fee */}
                <div className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 rounded-xl shadow-sm group hover:border-indigo-300 transition-all">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">ค่าส่ง:</span>
                  <input 
                    type="number" 
                    value={globalShippingFee}
                    onChange={(e) => setGlobalShippingFee(Number(e.target.value))}
                    className="w-10 text-sm font-bold text-indigo-600 outline-none bg-transparent text-center"
                  />
                  <span className="text-xs font-bold text-slate-300">฿</span>
                </div>

                {/* Action Group 1: Data */}
                <div className="flex bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                  <button 
                    onClick={copyToClipboard}
                    disabled={summaries.length === 0}
                    className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50 border-r border-slate-100 transition-colors"
                  >
                    <ClipboardCheck className="w-3.5 h-3.5" />
                    สรุปยอด
                  </button>
                  <button 
                    onClick={copyAllAddresses}
                    disabled={summaries.length === 0}
                    className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors"
                  >
                    <MapPin className="w-3.5 h-3.5" />
                    ที่อยู่
                  </button>
                </div>

                {/* Action Group 2: Export */}
                <div className="flex bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                  <button 
                    onClick={() => window.print()}
                    disabled={items.length === 0}
                    className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50 border-r border-slate-100 transition-colors"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    พิมพ์
                  </button>
                  <button 
                    onClick={exportToExcel}
                    disabled={items.length === 0}
                    className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-emerald-600 hover:bg-emerald-50 disabled:opacity-50 transition-colors"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5" />
                    Excel
                  </button>
                </div>
              </>
            )}
          </div>
        </header>

        {view === 'main' ? (
          <>
            {/* Sender Address Section */}
        <section className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
            <h2 className="font-bold text-slate-900 flex items-center gap-2">
              <MapPin className="w-5 h-5 text-indigo-600" />
              ที่อยู่ผู้ส่ง
            </h2>
            <button 
              onClick={() => setIsEditingSender(!isEditingSender)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all",
                isEditingSender 
                  ? "bg-emerald-600 text-white shadow-lg shadow-emerald-200" 
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              )}
            >
              <Edit3 className="w-3.5 h-3.5" />
              {isEditingSender ? 'บันทึกที่อยู่' : 'แก้ไขที่อยู่ผู้ส่ง'}
            </button>
          </div>
          <div className="p-6">
            {isEditingSender ? (
              <textarea 
                value={senderAddress}
                onChange={(e) => setSenderAddress(e.target.value)}
                placeholder="กรอกที่อยู่ผู้ส่งของคุณที่นี่..."
                className="w-full px-4 py-3 bg-white border border-indigo-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 text-sm h-24 transition-all"
              />
            ) : (
              <div 
                onClick={() => setIsEditingSender(true)}
                className={cn(
                  "p-4 rounded-xl border transition-all cursor-pointer hover:border-indigo-300 hover:bg-slate-50",
                  senderAddress ? "bg-slate-50 border-slate-100" : "bg-slate-50/50 border-dashed border-slate-200"
                )}
              >
                {senderAddress ? (
                  <p className="text-sm text-slate-600 whitespace-pre-wrap leading-relaxed">
                    {senderAddress}
                  </p>
                ) : (
                  <p className="text-sm text-slate-400 italic">
                    ยังไม่มีข้อมูลที่อยู่ผู้ส่ง (คลิกเพื่อเพิ่ม)
                  </p>
                )}
              </div>
            )}
          </div>
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column: Input */}
          <div className="lg:col-span-1 space-y-6">
            {/* Manual Entry */}
            <section 
              onPaste={handleFormPasteImage}
              className={cn(
                "p-6 rounded-2xl shadow-sm border transition-all",
                editingIndex !== null ? "bg-amber-50 border-amber-200" : "bg-white border-slate-200"
              )}
            >
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                {editingIndex !== null ? <Calculator className="w-5 h-5 text-amber-600" /> : <Plus className="w-5 h-5 text-indigo-600" />}
                {editingIndex !== null ? 'แก้ไขรายการประมูล' : 'เพิ่มรายการประมูล'}
              </h2>
              <form onSubmit={handleAddItem} className="space-y-4">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">ชื่อรายการ</label>
                    <input 
                      type="text" 
                      value={newItem}
                      onChange={(e) => setNewItem(e.target.value)}
                      placeholder="รายการที่ 1"
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">ย่อย (ถ้ามี)</label>
                    <input 
                      type="text" 
                      value={newSubItem}
                      onChange={(e) => setNewSubItem(e.target.value)}
                      placeholder="1"
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">ผู้ชนะประมูล</label>
                  <input 
                    type="text" 
                    value={newWinner}
                    onChange={(e) => setNewWinner(e.target.value)}
                    placeholder="ชื่อลูกค้า"
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">ราคา (บาท)</label>
                  <input 
                    type="number" 
                    value={newPrice}
                    onChange={(e) => setNewPrice(e.target.value)}
                    placeholder="0.00"
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">ช่องทางการติดต่อ (ลิ้งค์โปรไฟล์)</label>
                  <input 
                    type="text" 
                    value={newContactLink}
                    onChange={(e) => setNewContactLink(e.target.value)}
                    placeholder="https://facebook.com/..."
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                  />
                </div>

                {/* Form Image Upload */}
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">รูปภาพสินค้า (วางรูป Ctrl+V ได้เลย)</label>
                  <div className="grid grid-cols-3 gap-2 mb-2">
                    {formImages.map((img, idx) => (
                      <div key={idx} className="relative aspect-square rounded-lg overflow-hidden border border-slate-200 group">
                        <img src={img} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        <button 
                          type="button"
                          onClick={() => removeFormImage(idx)}
                          className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                    <label className="aspect-square rounded-lg border-2 border-dashed border-slate-200 hover:border-indigo-400 hover:bg-indigo-50 transition-all flex flex-col items-center justify-center cursor-pointer">
                      <ImageIcon className="w-5 h-5 text-slate-400" />
                      <span className="text-[8px] font-bold text-slate-400 mt-1">เพิ่มรูป</span>
                      <input type="file" className="hidden" multiple accept="image/*" onChange={handleFormFileSelect} />
                    </label>
                  </div>
                </div>

                <div className="flex gap-2">
                  <button 
                    type="submit"
                    className={cn(
                      "flex-1 py-2 rounded-lg font-medium transition-colors shadow-sm text-white",
                      editingIndex !== null ? "bg-amber-600 hover:bg-amber-700" : "bg-indigo-600 hover:bg-indigo-700"
                    )}
                  >
                    {editingIndex !== null ? 'บันทึกการแก้ไข' : 'เพิ่มรายการ'}
                  </button>
                  {editingIndex !== null && (
                    <button 
                      type="button"
                      onClick={cancelEditing}
                      className="px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-lg font-medium hover:bg-slate-50 transition-colors"
                    >
                      ยกเลิก
                    </button>
                  )}
                </div>
              </form>
            </section>
          </div>

          {/* Right Column: List & Summary */}
          <div className="lg:col-span-2 space-y-8">
            {/* Summary Cards */}
            <section>
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
                <h2 className="text-xl font-bold text-slate-900">สรุปยอดตามผู้ชนะ</h2>
                <div className="flex items-center gap-3 flex-1 md:max-w-xs">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input 
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="ค้นหาชื่อผู้ชนะ..."
                      className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all shadow-sm"
                    />
                    {searchQuery && (
                      <button 
                        onClick={() => setSearchQuery('')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  <div className="px-3 py-1 bg-emerald-100 text-emerald-700 rounded-full text-sm font-bold shrink-0">
                    ยอดรวมสินค้า: {grandTotal.toLocaleString()} ฿
                  </div>
                </div>
              </div>
              
              {summaries.length === 0 ? (
                <div className="bg-white border-2 border-dashed border-slate-200 rounded-2xl p-12 text-center">
                  <FileText className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                  <p className="text-slate-500">{searchQuery ? 'ไม่พบข้อมูลที่ค้นหา' : 'ยังไม่มีข้อมูลการประมูล'}</p>
                  <p className="text-sm text-slate-400">{searchQuery ? 'ลองค้นหาด้วยชื่ออื่น' : 'เพิ่มรายการด้วยฟอร์มด้านซ้าย'}</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <AnimatePresence mode="popLayout">
                    {summaries.map((summary) => (
                      <motion.div 
                        key={summary.winner}
                        layout
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        onClick={() => setSelectedWinner(summary)}
                        className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 hover:border-indigo-300 hover:shadow-md transition-all group/card relative overflow-hidden cursor-pointer"
                      >
                        <div className="flex justify-between items-start mb-3 relative z-10">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center">
                              <User className="w-4 h-4 text-indigo-600" />
                            </div>
                            <div className="flex flex-col">
                              <span className="font-bold text-slate-800 leading-none">{summary.winner}</span>
                              {summary.contactLink && (
                                <a 
                                  href={summary.contactLink} 
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className="text-[10px] text-indigo-500 hover:text-indigo-700 flex items-center gap-0.5 mt-1 font-medium"
                                >
                                  <LinkIcon className="w-2.5 h-2.5" />
                                  ดูโปรไฟล์
                                </a>
                              )}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-lg font-bold text-indigo-600">{summary.grandTotal.toLocaleString()} ฿</div>
                            <div className="text-[10px] text-slate-400 font-medium">(รวมค่าส่ง {summary.shippingFee} ฿)</div>
                          </div>
                        </div>

                        {/* Mini Images Preview */}
                        {summary.images && summary.images.length > 0 && (
                          <div className="flex -space-x-2 mb-4 relative z-10">
                            {summary.images.slice(0, 4).map((img, idx) => (
                              <img 
                                key={idx}
                                src={img} 
                                className="w-8 h-8 rounded-full border-2 border-white object-cover shadow-sm"
                                referrerPolicy="no-referrer"
                              />
                            ))}
                            {summary.images.length > 4 && (
                              <div className="w-8 h-8 rounded-full border-2 border-white bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-500 shadow-sm">
                                +{summary.images.length - 4}
                              </div>
                            )}
                          </div>
                        )}

                        <div className="space-y-2 mb-4 relative z-10">
                          {summary.items.map((main, idx) => (
                            <div key={idx} className="text-sm">
                              <div className="flex items-center gap-2 text-slate-700 font-medium">
                                <Package className="w-3 h-3 opacity-40" />
                                {main.name}
                              </div>
                              {main.subs.length > 0 && (
                                <div className="ml-5 text-[11px] text-slate-400 flex flex-wrap gap-1">
                                  ย่อย: {main.subs.join(', ')}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                        <div className="pt-3 border-t border-slate-100 flex justify-between items-center text-xs relative z-10">
                          <span className="text-slate-400">ค่าสินค้า: {summary.totalPrice.toLocaleString()} ฿</span>
                          <span className="text-slate-400">ค่าส่ง: {summary.shippingFee} ฿</span>
                        </div>

                        {/* Status Checkboxes */}
                        <div className="mt-4 pt-3 border-t border-slate-100 grid grid-cols-1 gap-2 relative z-10">
                          <label className="flex items-center gap-2 cursor-pointer group/check" onClick={(e) => e.stopPropagation()}>
                            <input 
                              type="checkbox" 
                              checked={summary.status?.isPaid} 
                              onChange={() => toggleStatus(summary.winner, 'isPaid')}
                              className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 transition-all"
                            />
                            <span className={`text-xs font-medium transition-colors ${summary.status?.isPaid ? 'text-emerald-600' : 'text-slate-500 group-hover/check:text-slate-700'}`}>
                              จ่ายเงินแล้ว
                            </span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer group/check" onClick={(e) => e.stopPropagation()}>
                            <input 
                              type="checkbox" 
                              checked={summary.status?.isPrepared} 
                              onChange={() => toggleStatus(summary.winner, 'isPrepared')}
                              className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 transition-all"
                            />
                            <span className={`text-xs font-medium transition-colors ${summary.status?.isPrepared ? 'text-amber-600' : 'text-slate-500 group-hover/check:text-slate-700'}`}>
                              จัดเตรียมสินค้าแล้ว
                            </span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer group/check" onClick={(e) => e.stopPropagation()}>
                            <input 
                              type="checkbox" 
                              checked={summary.status?.isShipped} 
                              onChange={() => toggleStatus(summary.winner, 'isShipped')}
                              className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 transition-all"
                            />
                            <span className={`text-xs font-medium transition-colors ${summary.status?.isShipped ? 'text-blue-600' : 'text-slate-500 group-hover/check:text-slate-700'}`}>
                              จัดส่งแล้ว
                            </span>
                          </label>
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              )}
            </section>
          </div>
        </div>

        {/* Detailed Table */}
            {filteredItems.length > 0 && (
              <section className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="px-6 py-4 border-bottom border-slate-100 bg-slate-50/50 flex justify-between items-center">
                  <h2 className="font-semibold text-slate-800">รายการทั้งหมด ({filteredItems.length})</h2>
                  <button 
                    onClick={() => setIsClearingAll(true)}
                    className="text-xs font-medium text-red-500 hover:text-red-600 transition-colors"
                  >
                    ล้างทั้งหมด
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="bg-slate-50 text-slate-500 border-b border-slate-100">
                        <th className="px-6 py-3 font-semibold uppercase tracking-wider text-[10px]">รายการ</th>
                        <th className="px-6 py-3 font-semibold uppercase tracking-wider text-[10px]">ย่อย</th>
                        <th className="px-6 py-3 font-semibold uppercase tracking-wider text-[10px]">ผู้ชนะ</th>
                        <th className="px-6 py-3 font-semibold uppercase tracking-wider text-[10px] text-right">ราคา</th>
                        <th className="px-6 py-3 w-10"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      <AnimatePresence>
                        {filteredItems.map((item, idx) => {
                          const originalIdx = items.findIndex(i => i === item);
                          return (
                            <motion.tr 
                              key={originalIdx}
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              exit={{ opacity: 0, x: -20 }}
                              className="hover:bg-slate-50/50 transition-colors group"
                            >
                              <td className="px-6 py-4 font-medium text-slate-700">{item.mainItem}</td>
                              <td className="px-6 py-4 text-slate-500">{item.subItem || '-'}</td>
                              <td className="px-6 py-4 text-slate-600">{item.winner}</td>
                              <td className="px-6 py-4 text-right font-mono font-medium text-slate-900">{item.price.toLocaleString()}</td>
                              <td className="px-6 py-4 text-right flex items-center justify-end gap-2">
                                <button 
                                  onClick={() => startEditing(originalIdx)}
                                  className="p-1 text-slate-300 hover:text-indigo-600 transition-colors opacity-0 group-hover:opacity-100"
                                  title="แก้ไข"
                                >
                                  <FileText className="w-4 h-4" />
                                </button>
                                <button 
                                  onClick={() => handleRemoveItem(originalIdx)}
                                  className="p-1 text-slate-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                                  title="ลบ"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </td>
                            </motion.tr>
                          );
                        })}
                      </AnimatePresence>
                    </tbody>
                  </table>
                </div>
              </section>
            )}
          </>
        ) : (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                <History className="w-7 h-7 text-indigo-600" />
                ประวัติการประมูล
              </h2>
              <div className="bg-indigo-600 text-white px-6 py-3 rounded-2xl shadow-lg shadow-indigo-200">
                <div className="text-[10px] font-bold uppercase opacity-80">ยอดรวมสะสมทั้งหมด</div>
                <div className="text-2xl font-bold">
                  {allDates.reduce((sum, d) => sum + d.total, 0).toLocaleString()} ฿
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Add New Date Card */}
              <button 
                onClick={() => setIsAddingDate(true)}
                className="group bg-white border-2 border-dashed border-indigo-200 rounded-3xl p-8 flex flex-col items-center justify-center gap-4 hover:border-indigo-400 hover:bg-indigo-50 transition-all min-h-[200px]"
              >
                <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Plus className="w-8 h-8 text-indigo-600" />
                </div>
                <div className="text-center">
                  <div className="font-bold text-indigo-600">เพิ่มวันประมูลใหม่</div>
                  <div className="text-xs text-indigo-400 mt-1">สร้างรายการแยกตามวัน</div>
                </div>
              </button>

              {allDates.map((history) => (
                <motion.div
                  key={history.date}
                  whileHover={{ y: -5 }}
                  className="bg-white rounded-3xl p-8 border border-slate-200 shadow-sm hover:shadow-xl hover:border-indigo-200 transition-all cursor-pointer group relative overflow-hidden"
                >
                  <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-50 rounded-bl-full -mr-8 -mt-8 transition-transform group-hover:scale-110" />
                  
                  <div className="relative z-10">
                    <div className="flex justify-between items-start mb-6">
                      <div 
                        onClick={() => {
                          setSelectedDate(history.date);
                          setView('main');
                        }}
                        className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center group-hover:bg-indigo-600 group-hover:text-white transition-colors"
                      >
                        <Calendar className="w-6 h-6" />
                      </div>
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeletingDate(history.date);
                        }}
                        className="p-2 text-slate-300 hover:text-red-500 transition-colors bg-white rounded-full shadow-sm border border-slate-100"
                        title="ลบประวัติ"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                    
                    <div 
                      onClick={() => {
                        setSelectedDate(history.date);
                        setView('main');
                      }}
                    >
                      <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">วันที่ประมูล</div>
                      <div className="text-2xl font-bold text-slate-900 mb-4">
                        {new Date(history.date).toLocaleDateString('th-TH', { 
                          year: 'numeric', 
                          month: 'long', 
                          day: 'numeric' 
                        })}
                      </div>
                      
                      <div className="pt-4 border-t border-slate-100 flex justify-between items-end">
                        <div>
                          <div className="text-[10px] font-bold text-slate-400 uppercase">ยอดขายรวม</div>
                          <div className="text-xl font-bold text-indigo-600">{history.total.toLocaleString()} ฿</div>
                        </div>
                        <div className="w-8 h-8 bg-slate-50 rounded-full flex items-center justify-center text-slate-400 group-hover:bg-indigo-100 group-hover:text-indigo-600 transition-colors">
                          <ArrowLeft className="w-4 h-4 rotate-180" />
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>

            {allDates.length === 0 && (
              <div className="bg-white border-2 border-dashed border-slate-200 rounded-3xl p-20 text-center">
                <History className="w-16 h-16 text-slate-200 mx-auto mb-6" />
                <h3 className="text-xl font-bold text-slate-900 mb-2">ยังไม่มีประวัติการประมูล</h3>
                <p className="text-slate-500">กดปุ่ม "เพิ่มวันประมูลใหม่" เพื่อเริ่มบันทึกข้อมูล</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>

      {/* Detail Modal */}
      <AnimatePresence>
        {selectedWinner && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedWinner(null)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              tabIndex={0}
              onPaste={(e) => handlePasteImage(e, selectedWinner.winner)}
              className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl overflow-hidden outline-none focus:ring-2 focus:ring-indigo-500/20"
            >
              {/* Modal Header */}
              <div className="px-8 py-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                <div className="flex items-center gap-3 flex-1">
                  <div className="w-10 h-10 bg-indigo-600 rounded-full flex items-center justify-center text-white shrink-0">
                    <User className="w-5 h-5" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      {isEditingModal ? (
                        <input 
                          type="text"
                          value={selectedWinner.winner}
                          onChange={(e) => updateWinnerName(selectedWinner.winner, e.target.value)}
                          className="text-xl font-bold text-slate-900 bg-white border border-indigo-200 rounded px-2 py-0.5 outline-none focus:ring-2 focus:ring-indigo-500 w-full max-w-[200px]"
                        />
                      ) : (
                        <h3 className="text-xl font-bold text-slate-900">{selectedWinner.winner}</h3>
                      )}
                      
                      {!isEditingModal && selectedWinner.contactLink && (
                        <a 
                          href={selectedWinner.contactLink} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="p-1.5 bg-indigo-100 text-indigo-600 rounded-lg hover:bg-indigo-200 transition-colors"
                          title="ไปที่โปรไฟล์"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">รายละเอียดบิลประมูล (กด Ctrl+V เพื่อวางรูปได้ที่นี่)</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => setIsEditingModal(!isEditingModal)}
                    className={cn(
                      "flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-bold transition-all",
                      isEditingModal 
                        ? "bg-emerald-600 text-white shadow-lg shadow-emerald-200" 
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    )}
                  >
                    <FileText className="w-4 h-4" />
                    {isEditingModal ? 'เสร็จสิ้น' : 'แก้ไขข้อมูล'}
                  </button>
                  <button 
                    onClick={() => {
                      setSelectedWinner(null);
                      setIsEditingModal(false);
                    }}
                    className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-400"
                  >
                    <X className="w-6 h-6" />
                  </button>
                </div>
              </div>

              {/* Modal Content */}
              <div className="p-8 max-h-[70vh] overflow-y-auto space-y-8">
                {/* Summary Section */}
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                    <div className="text-[10px] font-bold text-slate-400 uppercase mb-1">ค่าสินค้า</div>
                    <div className="text-xl font-bold text-slate-900">{selectedWinner.totalPrice.toLocaleString()} ฿</div>
                  </div>
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                    <div className="text-[10px] font-bold text-slate-400 uppercase mb-1">ค่าส่ง</div>
                    {isEditingModal ? (
                      <div className="flex items-center gap-1">
                        <input 
                          type="number"
                          value={globalShippingFee}
                          onChange={(e) => setGlobalShippingFee(Number(e.target.value))}
                          className="text-xl font-bold text-indigo-600 bg-white border border-indigo-200 rounded px-2 py-0.5 outline-none focus:ring-2 focus:ring-indigo-500 w-20"
                        />
                        <span className="font-bold text-slate-400">฿</span>
                      </div>
                    ) : (
                      <div className="text-xl font-bold text-slate-900">{selectedWinner.shippingFee.toLocaleString()} ฿</div>
                    )}
                  </div>
                  <div className="bg-indigo-600 p-4 rounded-2xl shadow-lg shadow-indigo-200">
                    <div className="text-[10px] font-bold text-indigo-200 uppercase mb-1">ยอดโอนรวม</div>
                    <div className="text-xl font-bold text-white">{selectedWinner.grandTotal.toLocaleString()} ฿</div>
                  </div>
                </div>

                {isEditingModal && (
                  <div className="space-y-4">
                    <div className="bg-amber-50 p-4 rounded-2xl border border-amber-200">
                      <label className="block text-xs font-bold text-amber-700 uppercase mb-2">ลิ้งค์ช่องทางการติดต่อ</label>
                      <input 
                        type="text"
                        value={selectedWinner.contactLink || ''}
                        onChange={(e) => updateContactLink(selectedWinner.winner, e.target.value)}
                        placeholder="https://facebook.com/..."
                        className="w-full px-3 py-2 bg-white border border-amber-200 rounded-xl outline-none focus:ring-2 focus:ring-amber-500 text-sm"
                      />
                    </div>
                    <div className="bg-amber-50 p-4 rounded-2xl border border-amber-200">
                      <label className="block text-xs font-bold text-amber-700 uppercase mb-2">ที่อยู่จัดส่ง</label>
                      <textarea 
                        value={selectedWinner.address || ''}
                        onChange={(e) => updateAddress(selectedWinner.winner, e.target.value)}
                        placeholder="บ้านเลขที่ ถนน แขวง เขต..."
                        className="w-full px-3 py-2 bg-white border border-amber-200 rounded-xl outline-none focus:ring-2 focus:ring-amber-500 text-sm h-24"
                      />
                    </div>
                  </div>
                )}

                {!isEditingModal && (
                  <div 
                    onClick={() => setIsEditingModal(true)}
                    className={cn(
                      "p-6 rounded-2xl border transition-all group relative cursor-pointer hover:border-indigo-300 hover:bg-slate-100/50",
                      selectedWinner.address ? "bg-slate-50 border-slate-100" : "bg-slate-50/50 border-dashed border-slate-200"
                    )}
                  >
                    <div className="flex justify-between items-center mb-2">
                      <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                        <Download className="w-4 h-4 text-indigo-600 rotate-180" />
                        ที่อยู่จัดส่ง
                      </h4>
                      <div className="flex items-center gap-1 text-[10px] font-bold text-indigo-600">
                        <FileText className="w-3 h-3" />
                        คลิกเพื่อแก้ไข
                      </div>
                    </div>
                    {selectedWinner.address ? (
                      <p className="text-sm text-slate-600 whitespace-pre-wrap leading-relaxed">
                        {selectedWinner.address}
                      </p>
                    ) : (
                      <p className="text-sm text-slate-400 italic">
                        ยังไม่มีข้อมูลที่อยู่จัดส่ง (คลิกเพื่อเพิ่ม)
                      </p>
                    )}
                  </div>
                )}

                {/* Status Section in Modal */}
                <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100">
                  <h4 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2">
                    <ClipboardCheck className="w-4 h-4 text-indigo-600" />
                    สถานะการดำเนินการ
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <label className={`flex items-center justify-center gap-2 p-3 rounded-xl border-2 transition-all cursor-pointer ${selectedWinner.status?.isPaid ? 'bg-emerald-50 border-emerald-500 text-emerald-700' : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'}`}>
                      <input 
                        type="checkbox" 
                        className="hidden"
                        checked={selectedWinner.status?.isPaid} 
                        onChange={() => toggleStatus(selectedWinner.winner, 'isPaid')}
                      />
                      <span className="text-sm font-bold">จ่ายเงินแล้ว</span>
                    </label>
                    <label className={`flex items-center justify-center gap-2 p-3 rounded-xl border-2 transition-all cursor-pointer ${selectedWinner.status?.isPrepared ? 'bg-amber-50 border-amber-500 text-amber-700' : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'}`}>
                      <input 
                        type="checkbox" 
                        className="hidden"
                        checked={selectedWinner.status?.isPrepared} 
                        onChange={() => toggleStatus(selectedWinner.winner, 'isPrepared')}
                      />
                      <span className="text-sm font-bold">จัดเตรียมสินค้าแล้ว</span>
                    </label>
                    <label className={`flex items-center justify-center gap-2 p-3 rounded-xl border-2 transition-all cursor-pointer ${selectedWinner.status?.isShipped ? 'bg-blue-50 border-blue-500 text-blue-700' : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'}`}>
                      <input 
                        type="checkbox" 
                        className="hidden"
                        checked={selectedWinner.status?.isShipped} 
                        onChange={() => toggleStatus(selectedWinner.winner, 'isShipped')}
                      />
                      <span className="text-sm font-bold">จัดส่งแล้ว</span>
                    </label>
                  </div>
                </div>

                {/* Items List */}
                <div>
                  <h4 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2">
                    <Package className="w-4 h-4 text-indigo-600" />
                    รายการสินค้า
                  </h4>
                  <div className="space-y-3">
                    {isEditingModal ? (
                      // Edit Mode: Show all individual items for this winner
                      items.map((item, idx) => {
                        if (item.winner !== selectedWinner.winner) return null;
                        return (
                          <div key={idx} className="bg-amber-50/50 p-4 rounded-xl border border-amber-100 space-y-3">
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="block text-[10px] font-bold text-amber-600 uppercase mb-1">รายการ</label>
                                <input 
                                  type="text"
                                  value={item.mainItem}
                                  onChange={(e) => updateItemDetail(idx, { mainItem: e.target.value })}
                                  className="w-full px-2 py-1 bg-white border border-amber-200 rounded outline-none focus:ring-2 focus:ring-amber-500 text-sm"
                                />
                              </div>
                              <div>
                                <label className="block text-[10px] font-bold text-amber-600 uppercase mb-1">ย่อย</label>
                                <input 
                                  type="text"
                                  value={item.subItem || ''}
                                  onChange={(e) => updateItemDetail(idx, { subItem: e.target.value })}
                                  className="w-full px-2 py-1 bg-white border border-amber-200 rounded outline-none focus:ring-2 focus:ring-amber-500 text-sm"
                                />
                              </div>
                            </div>
                            <div className="flex justify-between items-end">
                              <div className="flex-1 max-w-[150px]">
                                <label className="block text-[10px] font-bold text-amber-600 uppercase mb-1">ราคา</label>
                                <div className="flex items-center gap-1">
                                  <input 
                                    type="number"
                                    value={item.price}
                                    onChange={(e) => updateItemDetail(idx, { price: Number(e.target.value) })}
                                    className="w-full px-2 py-1 bg-white border border-amber-200 rounded outline-none focus:ring-2 focus:ring-amber-500 text-sm font-mono"
                                  />
                                  <span className="text-xs font-bold text-amber-400">฿</span>
                                </div>
                              </div>
                              <button 
                                onClick={() => handleRemoveItem(idx)}
                                className="p-2 text-red-400 hover:text-red-600 transition-colors"
                                title="ลบรายการนี้"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      // View Mode: Grouped items
                      selectedWinner.items.map((main, idx) => (
                        <div key={idx} className="bg-slate-50/50 p-4 rounded-xl border border-slate-100 flex justify-between items-center">
                          <div>
                            <div className="font-bold text-slate-800">{main.name}</div>
                            {main.subs.length > 0 && (
                              <div className="text-xs text-slate-500 mt-1">
                                รายการย่อย: {main.subs.join(', ')}
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="text-sm font-mono font-bold text-indigo-600">
                              ประมูลได้
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Images Grid */}
                <div>
                  <h4 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2">
                    <ImageIcon className="w-4 h-4 text-indigo-600" />
                    รูปภาพสินค้า ({selectedWinner.images?.length || 0})
                  </h4>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    {/* Upload/Paste Zone */}
                    <label className="relative group rounded-2xl overflow-hidden border-2 border-dashed border-indigo-200 hover:border-indigo-400 hover:bg-indigo-50 transition-all aspect-square flex flex-col items-center justify-center cursor-pointer">
                      <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
                        <Plus className="w-5 h-5 text-indigo-600" />
                      </div>
                      <span className="text-[10px] font-bold text-indigo-600 uppercase">เพิ่มรูปภาพ</span>
                      <span className="text-[8px] text-indigo-400 mt-1">คลิกหรือวางรูป (Ctrl+V)</span>
                      <input 
                        type="file" 
                        accept="image/*" 
                        multiple 
                        className="hidden" 
                        onChange={(e) => {
                          const files = e.target.files;
                          if (files) {
                            Array.from(files).forEach(file => {
                              const reader = new FileReader();
                              reader.onload = (ev) => {
                                const base64 = ev.target?.result as string;
                                setWinnerImages(prev => ({
                                  ...prev,
                                  [selectedWinner.winner]: [...(prev[selectedWinner.winner] || []), base64]
                                }));
                              };
                              reader.readAsDataURL(file);
                            });
                          }
                        }}
                      />
                    </label>

                    {selectedWinner.images && selectedWinner.images.map((img, idx) => (
                      <div key={idx} className="relative group rounded-2xl overflow-hidden border border-slate-200 shadow-sm aspect-square">
                        <img 
                          src={img} 
                          alt="Auction Item" 
                          className="w-full h-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                            <button 
                              onClick={() => setViewerIndex(idx)}
                              className="p-2 bg-white rounded-full text-indigo-600 hover:scale-110 transition-transform shadow-lg"
                              title="ดูรูปเต็ม"
                            >
                              <Maximize2 className="w-5 h-5" />
                            </button>
                            <button 
                              onClick={() => copyImageToClipboard(img)}
                              className="p-2 bg-white rounded-full text-indigo-600 hover:scale-110 transition-transform shadow-lg"
                              title="คัดลอกรูป"
                            >
                              <ClipboardCheck className="w-5 h-5" />
                            </button>
                            <button 
                              onClick={() => removeImage(selectedWinner.winner, idx)}
                              className="p-2 bg-white rounded-full text-red-500 hover:scale-110 transition-transform shadow-lg"
                              title="ลบรูป"
                            >
                              <Trash2 className="w-5 h-5" />
                            </button>
                          </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="px-8 py-6 bg-slate-50 border-t border-slate-100 space-y-3">
                <div className="flex gap-3">
                  <button 
                    onClick={() => copyWinnerSummary(selectedWinner)}
                    className="flex-1 bg-indigo-600 text-white py-3 rounded-xl font-bold hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-200 flex items-center justify-center gap-2"
                  >
                    <ClipboardCheck className="w-5 h-5" />
                    คัดลอกสรุปยอด (ข้อความ)
                  </button>
                  <button 
                    onClick={() => setSelectedWinner(null)}
                    className="px-6 py-3 bg-white border border-slate-200 text-slate-600 rounded-xl font-bold hover:bg-slate-50 transition-colors"
                  >
                    ปิด
                  </button>
                </div>
                {selectedWinner.images && selectedWinner.images.length > 0 && (
                  <p className="text-[10px] text-slate-400 text-center">
                    * คัดลอกข้อความแล้ว สามารถกดไอคอนคัดลอกที่ตัวรูปภาพเพื่อนำไปวางแยกได้
                  </p>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Image Viewer Lightbox */}
      <AnimatePresence>
        {viewerIndex !== null && selectedWinner && selectedWinner.images && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="relative w-full h-full flex items-center justify-center p-4 md:p-12"
            >
              {/* Close Button */}
              <button
                onClick={() => setViewerIndex(null)}
                className="absolute top-6 right-6 p-3 bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors z-10"
              >
                <X className="w-8 h-8" />
              </button>

              {/* Navigation Buttons */}
              {selectedWinner.images.length > 1 && (
                <>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setViewerIndex((prev) => (prev !== null ? (prev - 1 + selectedWinner.images!.length) % selectedWinner.images!.length : null));
                    }}
                    className="absolute left-6 p-4 bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors z-10"
                  >
                    <ChevronLeft className="w-10 h-10" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setViewerIndex((prev) => (prev !== null ? (prev + 1) % selectedWinner.images!.length : null));
                    }}
                    className="absolute right-6 p-4 bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors z-10"
                  >
                    <ChevronRight className="w-10 h-10" />
                  </button>
                </>
              )}

              {/* Image Container */}
              <div className="relative max-w-full max-h-full flex flex-col items-center gap-4">
                <motion.img
                  key={viewerIndex}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  src={selectedWinner.images[viewerIndex]}
                  className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl border border-white/10"
                  referrerPolicy="no-referrer"
                />
                
                {/* Image Info */}
                <div className="flex flex-col items-center gap-1">
                  <div className="px-4 py-1.5 bg-white/10 rounded-full text-white text-sm font-bold backdrop-blur-sm">
                    รูปที่ {viewerIndex + 1} / {selectedWinner.images.length}
                  </div>
                  <div className="text-white/60 text-xs font-medium">
                    {selectedWinner.winner}
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Add New Date Modal */}
      <AnimatePresence>
        {isAddingDate && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden"
            >
              <div className="p-8">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-12 h-12 bg-indigo-100 rounded-2xl flex items-center justify-center">
                    <Calendar className="w-6 h-6 text-indigo-600" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-slate-900">เลือกวันที่ประมูล</h3>
                    <p className="text-sm text-slate-500">ระบุวันที่ต้องการเริ่มบันทึกข้อมูล</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase mb-1.5 ml-1">วันที่</label>
                    <input 
                      type="date"
                      value={tempDate}
                      onChange={(e) => setTempDate(e.target.value)}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all font-medium"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 mt-8">
                  <button
                    onClick={() => setIsAddingDate(false)}
                    className="px-6 py-3 bg-slate-100 text-slate-600 rounded-xl font-bold hover:bg-slate-200 transition-colors"
                  >
                    ยกเลิก
                  </button>
                  <button
                    onClick={async () => {
                      if (tempDate) {
                        // Save to created dates list to ensure it persists even if empty
                        const createdDates = await localforage.getItem<string[]>('auction_created_dates') || [];
                        if (!createdDates.includes(tempDate)) {
                          await localforage.setItem('auction_created_dates', [...createdDates, tempDate]);
                        }
                        
                        await loadHistory();
                        setSelectedDate(tempDate);
                        setView('main');
                        setIsAddingDate(false);
                      }
                    }}
                    className="px-6 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 shadow-lg shadow-indigo-200 transition-all"
                  >
                    ตกลง
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {deletingDate && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden"
            >
              <div className="p-8 text-center">
                <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-6">
                  <Trash2 className="w-8 h-8 text-red-500" />
                </div>
                <h3 className="text-xl font-bold text-slate-900 mb-2">ยืนยันการลบ?</h3>
                <p className="text-slate-500 mb-8">
                  คุณแน่ใจหรือไม่ว่าต้องการลบข้อมูลของวันที่ <br/>
                  <span className="font-bold text-slate-900">
                    {new Date(deletingDate).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </span>
                  <br/>ข้อมูลทั้งหมดจะถูกลบถาวร
                </p>

                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setDeletingDate(null)}
                    className="px-6 py-3 bg-slate-100 text-slate-600 rounded-xl font-bold hover:bg-slate-200 transition-colors"
                  >
                    ยกเลิก
                  </button>
                  <button
                    onClick={() => deleteHistoryDate(deletingDate)}
                    className="px-6 py-3 bg-red-500 text-white rounded-xl font-bold hover:bg-red-600 shadow-lg shadow-red-200 transition-all"
                  >
                    ลบข้อมูล
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Clear All Confirmation Modal */}
      <AnimatePresence>
        {isClearingAll && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden"
            >
              <div className="p-8 text-center">
                <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-6">
                  <AlertTriangle className="w-8 h-8 text-red-500" />
                </div>
                <h3 className="text-xl font-bold text-slate-900 mb-2">ล้างข้อมูลทั้งหมด?</h3>
                <p className="text-slate-500 mb-8">
                  คุณแน่ใจหรือไม่ว่าต้องการล้างรายการประมูลทั้งหมดของวันนี้? <br/>
                  <span className="text-red-500 font-bold">การดำเนินการนี้ไม่สามารถย้อนกลับได้</span>
                </p>

                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setIsClearingAll(false)}
                    className="px-6 py-3 bg-slate-100 text-slate-600 rounded-xl font-bold hover:bg-slate-200 transition-colors"
                  >
                    ยกเลิก
                  </button>
                  <button
                    onClick={() => {
                      setItems([]);
                      setWinnerImages({});
                      setWinnerStatuses({});
                      setIsClearingAll(false);
                    }}
                    className="px-6 py-3 bg-red-500 text-white rounded-xl font-bold hover:bg-red-600 shadow-lg shadow-red-200 transition-all"
                  >
                    ยืนยันล้างข้อมูล
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    {/* Toast Notification */}
    <AnimatePresence>
      {toast && (
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 50 }}
          className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[9999]"
        >
          <div className={cn(
            "px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-3 min-w-[300px]",
            toast.type === 'success' ? "bg-slate-900 text-white" : "bg-red-500 text-white"
          )}>
            {toast.type === 'success' ? (
              <CheckCircle className="w-6 h-6 text-emerald-400" />
            ) : (
              <AlertTriangle className="w-6 h-6 text-white" />
            )}
            <span className="font-bold text-lg">{toast.message}</span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>

    {/* Print Only Section */}
    <div className="hidden print:block w-full bg-white text-black p-4">
      {summaries.map((s, idx) => (
        <div key={idx} className="w-full border-2 border-black rounded-2xl p-8 mb-8 break-inside-avoid" style={{ minHeight: '12cm' }}>
          <div className="flex justify-between items-start mb-12">
            <div className="w-1/2">
              <div className="font-bold text-xl mb-2 border-b-2 border-black pb-2 inline-block">ผู้ส่ง (Sender)</div>
              <div className="text-lg whitespace-pre-wrap">{senderAddress || '(ยังไม่ได้ระบุที่อยู่ผู้ส่ง)'}</div>
            </div>
            <div className="text-right">
              <div className="text-sm text-gray-500 font-bold">ออเดอร์: {s.winner}</div>
              <div className="text-sm text-gray-500">จำนวน: {s.items.length} รายการ</div>
            </div>
          </div>

          <div className="w-2/3 ml-auto border-2 border-black rounded-xl p-6 bg-gray-50">
            <div className="font-bold text-2xl mb-4 border-b-2 border-black pb-2 inline-block">ผู้รับ (Receiver)</div>
            <div className="text-2xl whitespace-pre-wrap font-medium leading-relaxed">
              {s.address || `(${s.winner})\n(ยังไม่ได้ระบุที่อยู่)`}
            </div>
            {s.contactLink && (
              <div className="mt-6 pt-4 border-t border-gray-300 text-sm text-gray-600">
                ติดต่อ: {s.contactLink}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
    </>
  );
}
