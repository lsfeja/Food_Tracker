import { Bike, BedDouble, Dumbbell, Flower2, Footprints, type LucideIcon, PersonStanding, Star, Waves, Zap } from "lucide-react";
import type { SportType } from "../../shared/workout";

const icons: Record<SportType, LucideIcon> = {
  strength: Dumbbell,
  run: Footprints,
  ride: Bike,
  indoorRide: Zap,
  swim: Waves,
  mobility: PersonStanding,
  yoga: Flower2,
  rest: BedDouble,
  custom: Star,
};

export function SportIcon({ sport, size = 20, className }: { sport: SportType; size?: number; className?: string }) {
  const Icon = icons[sport] ?? Star;
  return <Icon size={size} className={className} aria-hidden />;
}
