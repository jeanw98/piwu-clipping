import type { MotionGraphicsComponentName } from '@piwu/shared';
import { BigNumber } from './BigNumber';
import { Building } from './Building';
import { ChecklistSteps } from './ChecklistSteps';
import { Chip } from './Chip';
import { Comparison } from './Comparison';
import { EmptyChair } from './EmptyChair';
import { Eye } from './Eye';
import { Globe } from './Globe';
import { Host } from './Host';
import { IconBurst } from './IconBurst';
import { Letter } from './Letter';
import { Magnifier } from './Magnifier';
import { MythVsFact } from './MythVsFact';
import { Newspaper } from './Newspaper';
import { Quote } from './Quote';
import { Safe } from './Safe';
import { Silhouette } from './Silhouette';
import { SilhouettePair } from './SilhouettePair';
import { StockChart } from './StockChart';
import { Timeline } from './Timeline';
import { TitleCard } from './TitleCard';
import type { ComponentDef } from './types';

export const COMPONENTS: Record<MotionGraphicsComponentName, ComponentDef<any>> = {
  TitleCard,
  Chip,
  Newspaper,
  SilhouettePair,
  Silhouette,
  StockChart,
  Safe,
  Eye,
  Building,
  EmptyChair,
  Letter,
  BigNumber,
  ChecklistSteps,
  MythVsFact,
  Comparison,
  Globe,
  Timeline,
  IconBurst,
  Host,
  Quote,
  Magnifier,
};

export type { ComponentDef, DrawInfo } from './types';
