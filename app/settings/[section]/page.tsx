'use client';

import { notFound, useParams } from 'next/navigation';
import MainLayout from '@/components/layout/main-layout';
import { SETTINGS_SECTIONS } from '@/components/common/settings/sections';

export default function SettingsSectionPage() {
   const params = useParams<{ section: string }>();
   const section = SETTINGS_SECTIONS[params.section];

   if (!section) {
      notFound();
   }

   const SectionComponent = section.component;

   return (
      <MainLayout headersNumber={1}>
         <SectionComponent />
      </MainLayout>
   );
}
