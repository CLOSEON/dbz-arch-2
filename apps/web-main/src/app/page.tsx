'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { Capacitor } from '@capacitor/core';
import { DabzzoLoadingScreen } from '@/components/ui/loading';
import { MainNavbar } from '@/components/main/MainNavbar';
import { HeroSection } from '@/components/main/HeroSection';
import { TrustedBySection } from '@/components/main/TrustedBySection';
import { AboutDabzzo } from '@/components/main/AboutDabzzo';
import { HowItWorks } from '@/components/main/HowItWorks';
import { MealCategories } from '@/components/main/MealCategories';
import { PricingPlans } from '@/components/main/PricingPlans';
import { FeaturesBenefits } from '@/components/main/FeaturesBenefits';
import { AppPreview } from '@/components/main/AppPreview';
import { TestimonialsFaq } from '@/components/main/TestimonialsFaq';
import { FinalCta } from '@/components/main/FinalCta';
import { MainFooter } from '@/components/main/MainFooter';

export default function HomePage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const isHydrated = useAuthStore((s) => s.isHydrated);

  // In native apps (APK/iOS), skip the landing page and go straight to app screens
  const isNative = typeof window !== 'undefined' && Capacitor.isNativePlatform();

  useEffect(() => {
    if (!isNative || !isHydrated) return;

    if (user) {
      router.replace('/dashboard');
    } else {
      router.replace('/login');
    }
  }, [isNative, isHydrated, user, router]);

  if (isNative) {
    return <DabzzoLoadingScreen />;
  }

  return (
    <main className="min-h-screen overflow-hidden bg-ivory text-slate-950 selection:bg-brand/20 selection:text-brand-700">
      <MainNavbar />
      
      {/* Sections */}
      <HeroSection />
      <TrustedBySection />
      <AboutDabzzo />
      <HowItWorks />
      <MealCategories />
      <PricingPlans />
      <FeaturesBenefits />
      <AppPreview />
      <TestimonialsFaq />
      <FinalCta />
      
      <MainFooter />
    </main>
  );
}
