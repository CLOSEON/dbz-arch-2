import VendorDetailClient from './VendorDetailClient';

export function generateStaticParams() {
  return [{ vendorId: 'placeholder' }];
}

interface PageProps {
  params: Promise<{ vendorId: string }>;
}

export default function VendorDetailPage(props: PageProps) {
  return <VendorDetailClient params={props.params} />;
}
