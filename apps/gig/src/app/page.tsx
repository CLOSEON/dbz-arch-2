'use client';

import { auth } from '@dabzzo/shared-auth';
import { useState } from 'react';
import { db } from '@dabzzo/shared-auth';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import {
  ChefHat,
  Bike,
  CheckCircle2,
  Clock,
  IndianRupee,
  ShieldCheck,
  MapPin,
  Sparkles,
  Phone,
  ArrowRight,
  Loader2,
  Flame,
  Users
} from 'lucide-react';

type PartnerType = 'kitchen' | 'rider';

export default function GigHomePage() {
  const [partnerType, setPartnerType] = useState<PartnerType>('kitchen');
  const [submitting, setSubmitting] = useState(false);
  const [submittedId, setSubmittedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Kitchen form state
  const [kitchenForm, setKitchenForm] = useState({
    businessName: '',
    ownerName: '',
    phone: '',
    email: '',
    locality: '',
    cuisineType: 'North Indian & Homestyle',
    dailyCapacity: '30-75 tiffins/day',
    fssaiStatus: 'Have active FSSAI license',
  });

  // Rider form state
  const [riderForm, setRiderForm] = useState({
    fullName: '',
    phone: '',
    email: '',
    preferredZone: '',
    vehicleType: 'Motorcycle / Scooter',
    hasLicense: 'Yes',
    shiftAvailability: 'Both Lunch & Dinner shifts',
  });

  async function handleKitchenSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!kitchenForm.businessName || !kitchenForm.phone || !kitchenForm.ownerName) {
      setError('Please fill in all required fields (Kitchen Name, Owner Name, and Phone).');
      return;
    }

    setSubmitting(true);
    try {
      const docRef = await addDoc(collection(db, 'partner_applications'), {
        type: 'kitchen',
        ...kitchenForm,
        status: 'pending_review',
        created_at: serverTimestamp(),
      });
      setSubmittedId(docRef.id);
    } catch (err: any) {
      console.error('Failed to submit kitchen application:', err);
      setError(err?.message || 'Submission failed. Please try again or WhatsApp us directly.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRiderSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!riderForm.fullName || !riderForm.phone) {
      setError('Please fill in your Full Name and Phone Number.');
      return;
    }

    setSubmitting(true);
    try {
      const docRef = await addDoc(collection(db, 'partner_applications'), {
        type: 'rider',
        ...riderForm,
        status: 'pending_review',
        created_at: serverTimestamp(),
      });
      setSubmittedId(docRef.id);
    } catch (err: any) {
      console.error('Failed to submit rider application:', err);
      setError(err?.message || 'Submission failed. Please try again or WhatsApp us directly.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#FEFCE8] text-slate-900 selection:bg-amber-200">
      {/* Top Navigation */}
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-slate-200/60 px-4 sm:px-8 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-amber-500 to-orange-500 flex items-center justify-center text-white font-black shadow-md shadow-amber-500/20">
            D
          </div>
          <div>
            <span className="font-extrabold text-base tracking-tight block">DABZZO</span>
            <span className="text-[10px] font-black uppercase tracking-widest text-amber-600 block -mt-1">
              Partner Network
            </span>
          </div>
        </div>
        <a
          href="https://wa.me/919900990044?text=Hi%20Dabzzo,%20I%20want%20to%20partner%20with%20you"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs font-bold px-3.5 py-1.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200/80 hover:bg-emerald-100 transition flex items-center gap-1.5"
        >
          <Phone className="w-3.5 h-3.5" />
          <span>Support: +91 99009 90044</span>
        </a>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        {/* Hero Section */}
        <div className="text-center max-w-2xl mx-auto mb-10">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-100/70 border border-amber-200/80 text-amber-800 text-xs font-bold mb-4">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Join India's Fastest Growing Tiffin Subscription Platform</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900 mb-3">
            Earn More with Guaranteed Daily Volume
          </h1>
          <p className="text-slate-600 text-sm sm:text-base font-medium">
            Whether you run a passionate home kitchen or ride the city routes, Dabzzo connects you with predictable daily meal subscribers.
          </p>

          {/* Toggle Partner Type */}
          <div className="mt-8 inline-flex p-1.5 bg-slate-100 rounded-2xl border border-slate-200/80 shadow-inner">
            <button
              onClick={() => { setPartnerType('kitchen'); setSubmittedId(null); setError(null); }}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all ${
                partnerType === 'kitchen'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <ChefHat className="w-4 h-4 text-amber-500" />
              <span>Kitchen Partner</span>
            </button>
            <button
              onClick={() => { setPartnerType('rider'); setSubmittedId(null); setError(null); }}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all ${
                partnerType === 'rider'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Bike className="w-4 h-4 text-orange-500" />
              <span>Delivery Fleet Rider</span>
            </button>
          </div>
        </div>

        {submittedId ? (
          /* Confirmation State */
          <div className="bg-white rounded-3xl p-8 sm:p-12 border border-slate-200/80 shadow-xl max-w-xl mx-auto text-center animate-fade-in">
            <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <h2 className="text-2xl font-black text-slate-900 mb-2">Application Received!</h2>
            <p className="text-sm text-slate-600 mb-6">
              Thank you for applying to join the Dabzzo Partner Network. Our city operations team has received your details and will verify your application within 24 business hours.
            </p>
            <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 mb-6 text-left">
              <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">
                Application Reference
              </div>
              <div className="font-mono text-xs text-slate-800 break-all select-all font-bold">
                {submittedId}
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <a
                href={`https://wa.me/919900990044?text=Hi%20Dabzzo,%20I%20just%20submitted%20partner%20application%20${submittedId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 btn-primary py-3 text-xs flex items-center justify-center gap-2"
              >
                <span>Track on WhatsApp</span>
                <ArrowRight className="w-4 h-4" />
              </a>
              <button
                onClick={() => setSubmittedId(null)}
                className="btn-outline py-3 text-xs"
              >
                Submit Another Application
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-start">
            {/* Left Column: Benefits & Value Prop */}
            <div className="md:col-span-5 space-y-4">
              {partnerType === 'kitchen' ? (
                <>
                  <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-sm space-y-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
                        <Users className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-slate-900">Guaranteed Daily Volume</h3>
                        <p className="text-xs text-slate-500">Cook for 20-200 recurring tiffins, not unpredictable 1-off orders.</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center">
                        <Bike className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-slate-900">Zero Delivery Stress</h3>
                        <p className="text-xs text-slate-500">Dabzzo assigned riders pick up the whole batch at your door.</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                        <IndianRupee className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-slate-900">Weekly Guaranteed Payouts</h3>
                        <p className="text-xs text-slate-500">Direct NEFT/UPI settlement to your bank every Monday.</p>
                      </div>
                    </div>
                  </div>

                  <div className="bg-amber-500/10 rounded-2xl p-5 border border-amber-500/20 text-xs text-amber-900 space-y-2">
                    <div className="font-bold flex items-center gap-1.5">
                      <Flame className="w-4 h-4 text-amber-600" />
                      <span>Ready to onboard in 48 hours</span>
                    </div>
                    <p className="text-amber-800 leading-relaxed">
                      We provide thermal packaging crates, QR barcodes for tiffins, and dedicated vendor dashboard access.
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-sm space-y-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                        <MapPin className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-slate-900">Clustered Drop Routes</h3>
                        <p className="text-xs text-slate-500">Deliver 8-15 tiffins inside a tight 2km radius. No cross-city rush.</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                        <IndianRupee className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-slate-900">Fixed Batch Earnings</h3>
                        <p className="text-xs text-slate-500">Earn per delivery + punctuality bonuses directly to your wallet.</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
                        <Clock className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-slate-900">Predictable Shifts</h3>
                        <p className="text-xs text-slate-500">Morning (11:30 AM - 1:30 PM) & Evening (7:30 PM - 9:30 PM).</p>
                      </div>
                    </div>
                  </div>

                  <div className="bg-orange-500/10 rounded-2xl p-5 border border-orange-500/20 text-xs text-orange-900 space-y-2">
                    <div className="font-bold flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4 text-orange-600" />
                      <span>Instant Trip Navigation</span>
                    </div>
                    <p className="text-orange-800 leading-relaxed">
                      Turn-by-turn multi-stop GPS routing, customer call masking, and instant OTP verification via the Dabzzo Rider App.
                    </p>
                  </div>
                </>
              )}
            </div>

            {/* Right Column: Application Form */}
            <div className="md:col-span-7 bg-white rounded-3xl p-6 sm:p-8 border border-slate-200/80 shadow-xl">
              {error && (
                <div className="mb-6 p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
                  {error}
                </div>
              )}

              {partnerType === 'kitchen' ? (
                <form onSubmit={handleKitchenSubmit} className="space-y-4">
                  <h2 className="text-lg font-bold text-slate-900 mb-1">Kitchen Partner Application</h2>
                  <p className="text-xs text-slate-500 mb-4">Fill out your details to get listed on Dabzzo marketplace.</p>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Kitchen / Brand Name *</label>
                    <input
                      type="text"
                      placeholder="e.g. Annapurna Homestyle Tiffins"
                      value={kitchenForm.businessName}
                      onChange={(e) => setKitchenForm({ ...kitchenForm, businessName: e.target.value })}
                      className="input text-xs"
                      required
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Owner / Head Chef *</label>
                      <input
                        type="text"
                        placeholder="Your full name"
                        value={kitchenForm.ownerName}
                        onChange={(e) => setKitchenForm({ ...kitchenForm, ownerName: e.target.value })}
                        className="input text-xs"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Phone Number *</label>
                      <input
                        type="tel"
                        placeholder="10-digit mobile"
                        value={kitchenForm.phone}
                        onChange={(e) => setKitchenForm({ ...kitchenForm, phone: e.target.value })}
                        className="input text-xs"
                        required
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Email Address</label>
                      <input
                        type="email"
                        placeholder="chef@kitchen.com"
                        value={kitchenForm.email}
                        onChange={(e) => setKitchenForm({ ...kitchenForm, email: e.target.value })}
                        className="input text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Locality / Area *</label>
                      <input
                        type="text"
                        placeholder="e.g. Indiranagar, Bengaluru"
                        value={kitchenForm.locality}
                        onChange={(e) => setKitchenForm({ ...kitchenForm, locality: e.target.value })}
                        className="input text-xs"
                        required
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Primary Specialty</label>
                      <select
                        value={kitchenForm.cuisineType}
                        onChange={(e) => setKitchenForm({ ...kitchenForm, cuisineType: e.target.value })}
                        className="input text-xs bg-white"
                      >
                        <option value="Pure Vegetarian">Pure Vegetarian Homestyle</option>
                        <option value="North Indian & Homestyle">North Indian & Homestyle</option>
                        <option value="South Indian & Kerala Meals">South Indian & Kerala Meals</option>
                        <option value="Jain / Satvik Food">Jain / Satvik Food</option>
                        <option value="Multi-Cuisine">Multi-Cuisine (Veg + Non-Veg)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Target Daily Capacity</label>
                      <select
                        value={kitchenForm.dailyCapacity}
                        onChange={(e) => setKitchenForm({ ...kitchenForm, dailyCapacity: e.target.value })}
                        className="input text-xs bg-white"
                      >
                        <option value="15-30 tiffins/day">15 - 30 tiffins / day</option>
                        <option value="30-75 tiffins/day">30 - 75 tiffins / day</option>
                        <option value="75-150 tiffins/day">75 - 150 tiffins / day</option>
                        <option value="150+ tiffins/day">150+ tiffins / day</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">FSSAI Status</label>
                    <select
                      value={kitchenForm.fssaiStatus}
                      onChange={(e) => setKitchenForm({ ...kitchenForm, fssaiStatus: e.target.value })}
                      className="input text-xs bg-white"
                    >
                      <option value="Have active FSSAI license">Have active FSSAI license</option>
                      <option value="Applied / In process">Applied / In process</option>
                      <option value="Need assistance with FSSAI">Need Dabzzo assistance with FSSAI</option>
                    </select>
                  </div>

                  <button
                    type="submit"
                    disabled={submitting}
                    className="btn-primary mt-4 py-3.5 text-xs flex items-center justify-center gap-2"
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Submitting Application...</span>
                      </>
                    ) : (
                      <>
                        <span>Submit Kitchen Application</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </form>
              ) : (
                <form onSubmit={handleRiderSubmit} className="space-y-4">
                  <h2 className="text-lg font-bold text-slate-900 mb-1">Rider Partner Application</h2>
                  <p className="text-xs text-slate-500 mb-4">Join our dedicated meal delivery fleet with clustered drop routes.</p>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Full Legal Name *</label>
                    <input
                      type="text"
                      placeholder="As per Aadhaar or Driving License"
                      value={riderForm.fullName}
                      onChange={(e) => setRiderForm({ ...riderForm, fullName: e.target.value })}
                      className="input text-xs"
                      required
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Mobile Number *</label>
                      <input
                        type="tel"
                        placeholder="10-digit mobile"
                        value={riderForm.phone}
                        onChange={(e) => setRiderForm({ ...riderForm, phone: e.target.value })}
                        className="input text-xs"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Email (Optional)</label>
                      <input
                        type="email"
                        placeholder="rider@gmail.com"
                        value={riderForm.email}
                        onChange={(e) => setRiderForm({ ...riderForm, email: e.target.value })}
                        className="input text-xs"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Preferred Zone / Area *</label>
                      <input
                        type="text"
                        placeholder="e.g. Koramangala / BTM"
                        value={riderForm.preferredZone}
                        onChange={(e) => setRiderForm({ ...riderForm, preferredZone: e.target.value })}
                        className="input text-xs"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Vehicle Type</label>
                      <select
                        value={riderForm.vehicleType}
                        onChange={(e) => setRiderForm({ ...riderForm, vehicleType: e.target.value })}
                        className="input text-xs bg-white"
                      >
                        <option value="Motorcycle / Scooter">Motorcycle / Scooter (Petrol)</option>
                        <option value="EV 2-Wheeler">Electric 2-Wheeler (EV)</option>
                        <option value="Bicycle">Bicycle</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Driving License</label>
                      <select
                        value={riderForm.hasLicense}
                        onChange={(e) => setRiderForm({ ...riderForm, hasLicense: e.target.value })}
                        className="input text-xs bg-white"
                      >
                        <option value="Yes">Yes, have valid DL</option>
                        <option value="Learners">Learner's License</option>
                        <option value="No">No / Not Required (Bicycle)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Shift Availability</label>
                      <select
                        value={riderForm.shiftAvailability}
                        onChange={(e) => setRiderForm({ ...riderForm, shiftAvailability: e.target.value })}
                        className="input text-xs bg-white"
                      >
                        <option value="Both Lunch & Dinner shifts">Both Lunch & Dinner (4 hrs/day)</option>
                        <option value="Lunch shift only">Lunch only (11:30 AM - 1:30 PM)</option>
                        <option value="Dinner shift only">Dinner only (7:30 PM - 9:30 PM)</option>
                      </select>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={submitting}
                    className="btn-primary mt-4 py-3.5 text-xs flex items-center justify-center gap-2"
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Submitting Application...</span>
                      </>
                    ) : (
                      <>
                        <span>Submit Rider Application</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </form>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
