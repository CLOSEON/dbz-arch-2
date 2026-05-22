import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';

export function useDeliveryNavigation() {
  const navigateTo = async (address: string) => {
    if (!address) return;

    const encodedAddress = encodeURIComponent(address);
    const platform = Capacitor.getPlatform();

    if (platform === 'web') {
      window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodedAddress}`, '_blank');
      return;
    }

    try {
      if (platform === 'ios') {
        // Use maps: URI for iOS (Apple Maps)
        // daddr specifies the destination address
        await (App as any).openUrl({ url: `maps://?daddr=${encodedAddress}` });
      } else if (platform === 'android') {
        // Use geo: URI for Android
        // 0,0?q= allows passing a query string which can be coordinates or a literal address
        await (App as any).openUrl({ url: `geo:0,0?q=${encodedAddress}` });
      } else {
        throw new Error('Unsupported platform');
      }
    } catch (error) {
      console.warn('Native maps app failed to open, falling back to web.', error);
      window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodedAddress}`, '_blank');
    }
  };

  return { navigateTo };
}
