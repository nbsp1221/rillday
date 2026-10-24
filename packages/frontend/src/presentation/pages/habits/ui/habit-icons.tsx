import {
  Apple,
  Bed,
  Bike,
  BookOpen,
  Brain,
  Circle,
  Clover,
  Code,
  Coffee,
  Diamond,
  Droplets,
  Dumbbell,
  Footprints,
  GraduationCap,
  Heart,
  House,
  type LucideProps,
  Moon,
  Music,
  Pencil,
  Sparkles,
  Star,
  Sun,
  Timer,
  Wallet,
} from 'lucide-react';

export const habitIcons = [
  { id: 'circle', label: 'icons.circle', icon: Circle },
  { id: 'star', label: 'icons.star', icon: Star },
  { id: 'sparkles', label: 'icons.sparkles', icon: Sparkles },
  { id: 'diamond', label: 'icons.diamond', icon: Diamond },
  { id: 'droplets', label: 'icons.water', icon: Droplets },
  { id: 'dumbbell', label: 'icons.exercise', icon: Dumbbell },
  { id: 'footprints', label: 'icons.walking', icon: Footprints },
  { id: 'bike', label: 'icons.cycling', icon: Bike },
  { id: 'apple', label: 'icons.food', icon: Apple },
  { id: 'heart', label: 'icons.health', icon: Heart },
  { id: 'bed', label: 'icons.sleep', icon: Bed },
  { id: 'moon', label: 'icons.moon', icon: Moon },
  { id: 'book-open', label: 'icons.reading', icon: BookOpen },
  { id: 'graduation-cap', label: 'icons.learning', icon: GraduationCap },
  { id: 'pencil', label: 'icons.writing', icon: Pencil },
  { id: 'code', label: 'icons.coding', icon: Code },
  { id: 'timer', label: 'dates.time', icon: Timer },
  { id: 'brain', label: 'icons.focus', icon: Brain },
  { id: 'coffee', label: 'icons.coffee', icon: Coffee },
  { id: 'music', label: 'icons.music', icon: Music },
  { id: 'sun', label: 'icons.sunlight', icon: Sun },
  { id: 'clover', label: 'icons.clover', icon: Clover },
  { id: 'house', label: 'icons.home', icon: House },
  { id: 'wallet', label: 'icons.finance', icon: Wallet },
] as const;

export function resolveHabitIcon(value: string) {
  return habitIcons.find((item) => item.id === value);
}

export function HabitGlyph({ value, size = 18 }: { value: string; size?: LucideProps['size'] }) {
  const item = resolveHabitIcon(value);
  return item ? (
    <item.icon size={size} className="inline-block shrink-0 align-middle" />
  ) : (
    <span className="habit-custom-glyph" aria-hidden="true">
      {value}
    </span>
  );
}
