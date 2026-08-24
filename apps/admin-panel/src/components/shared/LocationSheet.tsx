'use client';

import {
  useState,
  useEffect,
  useRef,
  useCallback,
} from 'react';
import { useAuthStore } from '@/store/authStore';
import {
  getUserAddresses,
  addUserAddress,
  deleteUserAddress,
  setDefaultAddress,
  type UserAddress,
  type AddressType,
} from '@/lib/queries/addresses';
import {
  Search,
  X,
  Navigation,
  Home,
  Briefcase,
  MapPin,
  Loader2,
  Trash2,
  Check,
  ChevronRight,
} from 'lucide-react';

/* ─── Types ─────────────────────────────────────────────────────── */

interface NomResult {
  place_id:    string;
  display_name: string;
  lat:         string;
  lon:         string;
  address: Record<string, string | undefined>;
}

export interface SelectedLocation {
  label:    string;   // 'Home' | 'Work' | 'Koramangala, Bengaluru' …
  locality: string;
  city:     string;
  lat?:     number;
  lng?:     number;
}

interface Props {
  isOpen:   boolean;
  onClose:  () => void;
  onSelect: (loc: SelectedLocation) => void;
}

/* ─── Helpers ───────────────────────────────────────────────────── */

const NOM_HEADERS = {
  'Accept-Language': 'en',
  'User-Agent': 'Dabzzo/1.0 (dabzzo.in)',
};

function parseAddress(addr: Record<string, string | undefined>) {
  const locality =
    addr['suburb'] ?? addr['neighbourhood'] ?? addr['village'] ??
    addr['town']   ?? addr['county']        ?? '';
  const city =
    addr['city']           ?? addr['city_district'] ??
    addr['state_district'] ?? addr['state']         ?? '';
  return { locality, city };
}

function mapPhotonToNom(feat: any): NomResult {
  const p = feat.properties ?? {};
  const coords = feat.geometry?.coordinates ?? [0, 0];

  const name = p.name || '';
  const locality = p.district || p.locality || '';
  const street = p.street || '';
  const city = p.city || '';
  const state = p.state || '';
  const postcode = p.postcode || '';
  const country = p.country || '';

  const secondaryParts = [street, locality, city, state, postcode, country].filter(Boolean);
  
  let displayName = '';
  if (name) {
    displayName = name;
    if (secondaryParts.length > 0) {
      const filteredParts = secondaryParts[0] === name ? secondaryParts.slice(1) : secondaryParts;
      if (filteredParts.length > 0) {
        displayName += ', ' + filteredParts.join(', ');
      }
    }
  } else {
    displayName = secondaryParts.join(', ');
  }

  return {
    place_id: String(p.osm_id || Math.random()),
    display_name: displayName,
    lat: String(coords[1]),
    lon: String(coords[0]),
    address: {
      suburb: locality || street,
      neighbourhood: street,
      city: city,
      state: state
    }
  };
}

const ADDR_TYPES: { type: AddressType; label: string; Icon: typeof Home }[] = [
  { type: 'home',  label: 'Home',  Icon: Home       },
  { type: 'work',  label: 'Work',  Icon: Briefcase  },
  { type: 'other', label: 'Other', Icon: MapPin     },
];

function typeIcon(type: AddressType) {
  return ADDR_TYPES.find((t) => t.type === type) ?? ADDR_TYPES[2];
}

/* ─── Component ─────────────────────────────────────────────────── */

export function LocationSheet({ isOpen, onClose, onSelect }: Props) {
  const user = useAuthStore((s) => s.user);

  /* Sheet entrance animation */
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (isOpen) {
      requestAnimationFrame(() => setVisible(true));
    } else {
      setVisible(false);
    }
  }, [isOpen]);

  /* Saved addresses */
  const [addresses,     setAddresses]     = useState<UserAddress[]>([]);
  const [addrLoading,   setAddrLoading]   = useState(false);

  /* Search */
  const [query_,         setQuery]          = useState('');
  const [results,        setResults]        = useState<NomResult[]>([]);
  const [searchBusy,     setSearchBusy]     = useState(false);
  const searchRef      = useRef<HTMLInputElement>(null);
  const debounceRef    = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* GPS */
  const [detecting,     setDetecting]     = useState(false);

  /* Save-address flow */
  const [saveMode,       setSaveMode]      = useState(false);
  const [pendingResult,  setPendingResult] = useState<NomResult | null>(null);
  const [pendingType,    setPendingType]   = useState<AddressType>('home');
  const [saving,         setSaving]        = useState(false);

  /* Load addresses whenever sheet opens */
  useEffect(() => {
    if (!isOpen || !user?.id) return;
    setAddrLoading(true);
    getUserAddresses(user.id)
      .then(setAddresses)
      .catch(() => setAddresses([]))
      .finally(() => setAddrLoading(false));
  }, [isOpen, user?.id]);

  /* Focus search + reset on open/close */
  useEffect(() => {
    if (isOpen) {
      const t = setTimeout(() => searchRef.current?.focus(), 320);
      return () => clearTimeout(t);
    } else {
      setQuery('');
      setResults([]);
      setSaveMode(false);
      setPendingResult(null);
    }
  }, [isOpen]);

  /* Debounced Photon search biased towards Nagpur, Maharashtra */
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query_.trim()) { setResults([]); return; }
    debounceRef.current = setTimeout(async () => {
      setSearchBusy(true);
      try {
        // Biasing search to Nagpur (21.1458, 79.0882)
        const lat = 21.1458;
        const lon = 79.0882;
        const r = await fetch(
          `https://photon.komoot.io/api/?q=${encodeURIComponent(query_)}&lat=${lat}&lon=${lon}&limit=10&lang=en`
        );
        const data = await r.json() as { features: any[] };
        const mapped = (data.features ?? []).map(mapPhotonToNom);
        setResults(mapped);
      } catch {
        setResults([]);
      } finally {
        setSearchBusy(false);
      }
    }, 480);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query_]);

  /* ── GPS detect → select immediately (no save required) ── */
  const handleDetect = useCallback(() => {
    if (!('geolocation' in navigator) || detecting) return;
    setDetecting(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const { latitude, longitude } = pos.coords;
          const r = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`,
            { headers: NOM_HEADERS },
          );
          const data = await r.json() as NomResult;
          const { locality, city } = parseAddress(data.address);
          const label = [locality, city].filter(Boolean).join(', ') || 'My Location';
          onSelect({ label, locality, city, lat: latitude, lng: longitude });
          onClose();
        } catch {
          onSelect({ label: 'My Location', locality: '', city: '' });
          onClose();
        } finally {
          setDetecting(false);
        }
      },
      () => setDetecting(false),
      { timeout: 10000, enableHighAccuracy: false },
    );
  }, [detecting, onSelect, onClose]);

  /* ── Select search result → open save flow ── */
  const handleResultPick = (result: NomResult) => {
    setPendingResult(result);
    setSaveMode(true);
    setQuery('');
    setResults([]);
  };

  /* ── Select saved address ── */
  const handleSavedPick = async (addr: UserAddress) => {
    onSelect({ label: addr.label, locality: addr.locality, city: addr.city, lat: addr.lat, lng: addr.lng });
    if (user?.id && !addr.is_default) {
      void setDefaultAddress(user.id, addr.id, addresses.map((a) => a.id));
    }
    onClose();
  };

  /* ── Save new address ── */
  const handleSave = async () => {
    if (!user?.id || !pendingResult) return;
    setSaving(true);
    try {
      const { locality, city } = parseAddress(pendingResult.address);
      const { label } = typeIcon(pendingType);
      const saved = await addUserAddress(user.id, {
        label,
        type: pendingType,
        locality,
        city,
        full_address: pendingResult.display_name,
        lat: parseFloat(pendingResult.lat),
        lng: parseFloat(pendingResult.lon),
        is_default: addresses.length === 0,
      });
      setAddresses((prev) => [...prev, saved]);
      onSelect({ label, locality, city, lat: saved.lat, lng: saved.lng });
      onClose();
    } catch (err) {
      console.error('Failed to save address:', err);
    } finally {
      setSaving(false);
    }
  };

  /* ── Delete saved address ── */
  const handleDelete = async (e: React.MouseEvent, addr: UserAddress) => {
    e.stopPropagation();
    if (!user?.id) return;
    try {
      await deleteUserAddress(user.id, addr.id);
      setAddresses((prev) => prev.filter((a) => a.id !== addr.id));
    } catch { /* non-critical */ }
  };

  if (!isOpen && !visible) return null;

  /* ─── Render ─────────────────────────────────────────────────── */
  return (
    <div
      className="fixed inset-0 z-50 flex flex-col justify-end"
      style={{ maxWidth: '448px', margin: '0 auto', left: 0, right: 0 }}
      role="dialog"
      aria-modal="true"
      aria-label="Select delivery location"
    >
      {/* ── Backdrop ── */}
      <div
        aria-hidden
        className="absolute inset-0 cursor-pointer"
        style={{
          background: 'rgba(0,0,0,0.45)',
          backdropFilter: 'blur(3px)',
          WebkitBackdropFilter: 'blur(3px)',
          opacity: visible ? 1 : 0,
          transition: 'opacity 0.28s ease',
        }}
        onClick={onClose}
      />

       {/* ── Sheet ── */}
      <div
        className="relative z-10 rounded-t-3xl bg-white overflow-hidden flex flex-col"
        style={{
          maxHeight: '88vh',
          transform: visible ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 0.32s cubic-bezier(0.32,0.72,0,1)',
          boxShadow: '0 -12px 48px rgba(0,0,0,0.18)',
          paddingBottom: 'max(24px, env(safe-area-inset-bottom, 24px))',
        }}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-0 shrink-0">
          <div className="h-1 w-10 rounded-full bg-slate-200" />
        </div>

        {saveMode && pendingResult ? (
          /* ════════════ SAVE ADDRESS FLOW ════════════ */
          <div className="px-5 pt-4 pb-8 overflow-y-auto">
            {/* Header */}
            <div className="mb-5 flex items-center gap-3">
              <button
                aria-label="Back"
                onClick={() => { setSaveMode(false); setPendingResult(null); }}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-600 transition-all active:scale-95 hover:bg-slate-100"
              >
                <X className="h-4 w-4" strokeWidth={2.5} />
              </button>
              <h2 className="text-[18px] font-black text-slate-950">Save this address</h2>
            </div>

            {/* Address preview card */}
            <div className="mb-5 rounded-2xl border border-slate-100 bg-slate-50 p-4">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand/10">
                  <MapPin className="h-[17px] w-[17px] text-brand" strokeWidth={2.2} />
                </div>
                <div className="min-w-0">
                  <p className="text-[13.5px] font-black text-slate-900">
                    {(() => { const { locality, city } = parseAddress(pendingResult.address); return locality || city || 'Selected Location'; })()}
                  </p>
                  <p className="mt-0.5 line-clamp-2 text-[11px] leading-relaxed text-slate-500">
                    {pendingResult.display_name}
                  </p>
                </div>
              </div>
            </div>

            {/* Label selection */}
            <p className="mb-3 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
              Save as
            </p>
            <div className="mb-6 flex gap-3">
              {ADDR_TYPES.map(({ type, label, Icon }) => {
                const active = pendingType === type;
                return (
                  <button
                    key={type}
                    onClick={() => setPendingType(type)}
                    className="flex flex-1 flex-col items-center gap-2 rounded-2xl border-2 py-4 transition-all duration-200 active:scale-95"
                    style={{
                      borderColor: active ? '#FF3B30' : '#E2E8F0',
                      background:  active ? 'rgba(255,59,48,0.05)' : '#fff',
                    }}
                    aria-pressed={active}
                  >
                    <div
                      className="flex h-10 w-10 items-center justify-center rounded-xl transition-colors"
                      style={{ background: active ? '#FF3B30' : '#F1F5F9' }}
                    >
                      <Icon className="h-5 w-5" style={{ color: active ? '#fff' : '#64748b' }} strokeWidth={2} />
                    </div>
                    <span
                      className="text-[11.5px] font-black"
                      style={{ color: active ? '#FF3B30' : '#64748b' }}
                    >
                      {label}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Save CTA */}
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex w-full items-center justify-center gap-2 rounded-2xl py-[15px] text-[14px] font-black text-white transition-all duration-200 active:scale-[0.98] disabled:opacity-60"
              style={{ background: '#FF3B30', boxShadow: '0 6px 24px rgba(255,59,48,0.28)' }}
            >
              {saving
                ? <><Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.5} /> Saving…</>
                : <><Check    className="h-4 w-4"               strokeWidth={2.5} /> Save as {typeIcon(pendingType).label}</>
              }
            </button>
          </div>
        ) : (
          /* ════════════ MAIN SHEET ════════════ */
          <>
            {/* ── Sticky header + search ── */}
            <div className="shrink-0 bg-white px-5 pb-3 pt-3 shadow-[0_1px_0_rgba(0,0,0,0.05)]">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-[19px] font-black text-slate-950">Delivery location</h2>
                <button
                  aria-label="Close"
                  onClick={onClose}
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition-all hover:bg-slate-200 active:scale-95"
                >
                  <X className="h-4 w-4" strokeWidth={2.5} />
                </button>
              </div>

              {/* Search input */}
              <div className="relative">
                <div className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                  {searchBusy
                    ? <Loader2 className="h-[15px] w-[15px] animate-spin" strokeWidth={2.3} />
                    : <Search  className="h-[15px] w-[15px]"               strokeWidth={2.3} />
                  }
                </div>
                <input
                  ref={searchRef}
                  value={query_}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search for area, street name…"
                  aria-label="Search for a location"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3.5 pl-11 pr-10 text-[13.5px] font-medium text-slate-900 outline-none transition-all duration-200 placeholder:text-slate-400 focus:border-brand/40 focus:bg-white focus:shadow-[0_4px_16px_rgba(255,59,48,0.1)]"
                />
                {query_ && (
                  <button
                    aria-label="Clear search"
                    onClick={() => { setQuery(''); setResults([]); searchRef.current?.focus(); }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 transition-colors hover:text-slate-600"
                  >
                    <X className="h-3.5 w-3.5" strokeWidth={2.5} />
                  </button>
                )}
              </div>
            </div>

            {/* ── Scrollable body ── */}
            <div className="flex-1 overflow-y-auto px-5 py-4">

              {query_.trim() ? (
                /* ── Search Mode ── */
                searchBusy ? (
                  /* Loading State */
                  <div className="space-y-3">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="flex items-center gap-3.5 py-3">
                        <div className="h-9 w-9 shrink-0 animate-pulse rounded-xl bg-slate-100" />
                        <div className="flex-1 space-y-2">
                          <div className="h-4 w-1/3 animate-pulse rounded bg-slate-100" />
                          <div className="h-3 w-3/4 animate-pulse rounded bg-slate-100" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : results.length > 0 ? (
                  /* Results List */
                  <div>
                    <p className="mb-2 text-[9.5px] font-black uppercase tracking-[0.22em] text-slate-400">Results</p>
                    <div className="divide-y divide-slate-50">
                      {results.map((r) => {
                        const { locality, city } = parseAddress(r.address);
                        const primary   = locality || city || 'Location';
                        const secondary = r.display_name;
                        return (
                          <button
                            key={r.place_id}
                            onClick={() => handleResultPick(r)}
                            className="flex w-full items-center gap-3.5 rounded-xl py-3 text-left transition-all duration-150 hover:bg-slate-50 active:scale-[0.99] active:bg-slate-100"
                          >
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100">
                              <MapPin className="h-[15px] w-[15px] text-slate-500" strokeWidth={2} />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-[13px] font-bold text-slate-900">{primary}</p>
                              <p className="mt-0.5 truncate text-[11px] text-slate-500">{secondary}</p>
                            </div>
                            <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" strokeWidth={2} />
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  /* No Results Found */
                  <div className="py-8 text-center">
                    <div className="mb-3 text-3xl">🔍</div>
                    <p className="text-[13.5px] font-black text-slate-900">No results found</p>
                    <p className="mt-1 text-[11.5px] text-slate-500 px-4">
                      We couldn't find "{query_}". Try checking the spelling or search for another area.
                    </p>
                  </div>
                )
              ) : (
                /* ── Default Mode (Use GPS & Saved Addresses) ── */
                <>
                  {/* ── Use current location ── */}
                  <button
                    onClick={handleDetect}
                    disabled={detecting}
                    className="mb-5 flex w-full items-center gap-3.5 rounded-2xl border-2 p-4 transition-all duration-200 hover:border-brand hover:bg-brand/5 active:scale-[0.99] disabled:opacity-60"
                    style={{ borderColor: detecting ? '#FF3B30' : '#E2E8F0', borderStyle: 'dashed' }}
                  >
                    <div
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors"
                      style={{ background: detecting ? '#FF3B30' : '#F1F5F9' }}
                    >
                      {detecting
                        ? <Loader2  className="h-5 w-5 animate-spin text-white" strokeWidth={2} />
                        : <Navigation className="h-5 w-5 text-slate-600"          strokeWidth={2} />
                      }
                    </div>
                    <div className="text-left">
                      <p className="text-[13.5px] font-black text-slate-900">
                        {detecting ? 'Detecting your location…' : 'Use current location'}
                      </p>
                      <p className="mt-0.5 text-[11px] text-slate-500">Using device GPS</p>
                    </div>
                  </button>

                  {/* ── Saved addresses ── */}
                  {addrLoading ? (
                    <div className="space-y-2.5">
                      {[1, 2].map((i) => (
                        <div key={i} className="h-[68px] animate-pulse rounded-2xl bg-slate-100" />
                      ))}
                    </div>
                  ) : addresses.length > 0 && (
                    <div>
                      <p className="mb-2 text-[9.5px] font-black uppercase tracking-[0.22em] text-slate-400">
                        Saved addresses
                      </p>
                      <div className="space-y-2">
                        {addresses.map((addr) => {
                          const { Icon } = typeIcon(addr.type);
                          return (
                            <button
                              key={addr.id}
                              onClick={() => handleSavedPick(addr)}
                              className="group flex w-full items-center gap-3.5 rounded-2xl border border-slate-100 bg-white p-4 text-left shadow-sm transition-all duration-200 hover:border-brand/30 hover:bg-brand/5 active:scale-[0.99]"
                            >
                              <div
                                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors"
                                style={{ background: addr.is_default ? '#FF3B30' : '#F1F5F9' }}
                              >
                                <Icon
                                  className="h-5 w-5"
                                  style={{ color: addr.is_default ? '#fff' : '#64748b' }}
                                  strokeWidth={2}
                                />
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <p className="text-[13.5px] font-black text-slate-900">{addr.label}</p>
                                  {addr.is_default && (
                                    <span className="rounded-full bg-brand/10 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider text-brand">
                                      Default
                                    </span>
                                  )}
                                </div>
                                <p className="mt-0.5 truncate text-[11px] text-slate-500">
                                  {[addr.locality, addr.city].filter(Boolean).join(', ')}
                                </p>
                              </div>
                              {/* Delete — revealed on hover */}
                              <button
                                aria-label={`Delete ${addr.label}`}
                                onClick={(e) => handleDelete(e, addr)}
                                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-rose-50 text-rose-300 opacity-0 transition-all duration-200 hover:bg-rose-100 hover:text-rose-500 active:scale-90 group-hover:opacity-100"
                              >
                                <Trash2 className="h-3.5 w-3.5" strokeWidth={2.3} />
                              </button>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* ── Empty state hint ── */}
                  {!addrLoading && addresses.length === 0 && (
                    <p className="mt-2 text-center text-[12px] text-slate-400">
                      Search above or detect your location to save your first address
                    </p>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
