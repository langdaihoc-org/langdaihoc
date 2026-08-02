import { useParams } from 'react-router-dom';
import { ShipProxyForm } from './ship-proxy-form';

export function ShipProxyBookPage() {
  const { sellerId } = useParams();
  return <ShipProxyForm preferredSellerId={sellerId} />;
}
