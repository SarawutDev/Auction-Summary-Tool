export interface AuctionItem {
  mainItem: string;
  subItem?: string;
  winner: string;
  price: number;
  contactLink?: string;
  address?: string;
}

export interface AuctionSummary {
  winner: string;
  items: {
    name: string;
    subs: string[];
    price: number;
  }[];
  totalPrice: number;
  shippingFee: number;
  grandTotal: number;
  images?: string[];
  contactLink?: string;
  address?: string;
  status?: {
    isPaid: boolean;
    isPrepared: boolean;
    isShipped: boolean;
  };
}

export const SHIPPING_FEE_PER_WINNER = 50;

export function groupAuctionItems(items: AuctionItem[], shippingFee: number = SHIPPING_FEE_PER_WINNER): AuctionSummary[] {
  const groups: Record<string, AuctionSummary> = {};

  items.forEach((item) => {
    const winner = item.winner.trim();
    if (!groups[winner]) {
      groups[winner] = {
        winner,
        items: [],
        totalPrice: 0,
        shippingFee: shippingFee,
        grandTotal: 0,
        contactLink: item.contactLink,
        address: item.address
      };
    }
    
    // Update contact link if it was missing and now provided
    if (!groups[winner].contactLink && item.contactLink) {
      groups[winner].contactLink = item.contactLink;
    }

    // Update address if it was missing and now provided
    if (!groups[winner].address && item.address) {
      groups[winner].address = item.address;
    }
    
    // Find or create main item entry for this winner
    let mainEntry = groups[winner].items.find(i => i.name === item.mainItem);
    if (!mainEntry) {
      mainEntry = { name: item.mainItem, subs: [], price: 0 };
      groups[winner].items.push(mainEntry);
    }
    
    if (item.subItem) {
      mainEntry.subs.push(item.subItem);
    }
    
    mainEntry.price += item.price;
    groups[winner].totalPrice += item.price;
  });

  // Calculate grand totals after grouping
  Object.values(groups).forEach(summary => {
    summary.grandTotal = summary.totalPrice + summary.shippingFee;
  });

  return Object.values(groups).sort((a, b) => b.grandTotal - a.grandTotal);
}

