'use client';

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

export default function LandingPage() {
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
