import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

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

export async function parseAuctionText(text: string): Promise<AuctionItem[]> {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Parse the following auction text and extract the items, sub-items, winners, and prices. 
    
    Rules:
    1. Identify the main item (รายการ) and the sub-item (รายการย่อย/ลำดับ).
    2. If a row is missing a winner or price, skip it.
    3. Ensure the price is a number.
    4. Handle Thai, English, and other languages correctly.
    5. Context awareness: If a main item name is listed once but followed by multiple sub-items, associate all those sub-items with that main item.
    6. Return an array of objects with keys: "mainItem", "subItem", "winner", "price".

    Text: "${text}"`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            mainItem: { type: Type.STRING },
            subItem: { type: Type.STRING },
            winner: { type: Type.STRING },
            price: { type: Type.NUMBER },
            contactLink: { type: Type.STRING },
          },
          required: ["mainItem", "winner", "price"],
        },
      },
    },
  });

  try {
    return JSON.parse(response.text || "[]");
  } catch (e) {
    console.error("Failed to parse Gemini response", e);
    return [];
  }
}

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
