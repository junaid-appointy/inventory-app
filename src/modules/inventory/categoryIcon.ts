import { Coffee, Package, PenLine, ShoppingBasket, SprayCan, type LucideIcon } from 'lucide-react-native';

/**
 * A picture for each category (stands in for product photos in the
 * reference designs; we do not store images on the phone). Unknown
 * categories fall back to a box.
 */
const ICONS: Record<string, LucideIcon> = {
  grocery: ShoppingBasket,
  cleaning: SprayCan,
  office: PenLine,
  stationery: PenLine,
  cafeteria: Coffee,
  pantry: Coffee,
};

export function categoryIcon(category: string | null | undefined): LucideIcon {
  return (category && ICONS[category.trim().toLowerCase()]) || Package;
}
