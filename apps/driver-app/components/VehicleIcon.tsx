import React from 'react';
import Svg, { Path, Circle, Rect, G } from 'react-native-svg';
import type { VehicleId } from '../../../packages/vehicle-profiles/index';

interface Props {
  id: VehicleId;
  size?: number;
  color?: string;
}

const VB_W = 56;
const VB_H = 32;

export function VehicleIcon({ id, size = 48, color = '#9ca3af' }: Props) {
  const h = Math.round(size * (VB_H / VB_W));
  return (
    <Svg width={size} height={h} viewBox={`0 0 ${VB_W} ${VB_H}`}>
      {icon(id, color)}
    </Svg>
  );
}

function Wheel({ cx, cy, r = 5, color }: { cx: number; cy: number; r?: number; color: string }) {
  return (
    <G>
      <Circle cx={cx} cy={cy} r={r} stroke="none" fill="rgba(0,0,0,0.35)" />
      <Circle cx={cx} cy={cy} r={r - 0.8} stroke="none" fill={color} opacity={0.18} />
      <Circle cx={cx} cy={cy} r={r} strokeWidth={1.4} stroke={color} fill="none" />
      <Circle cx={cx} cy={cy} r={1.8} fill={color} opacity={0.6} />
    </G>
  );
}

function icon(id: VehicleId, c: string): React.ReactNode {
  // All paths use side-view, road at y=31, wheel centres at y=25 (r=5 → touch y=30)
  // color is passed as stroke/fill directly since SVG currentColor doesn't work in RN

  switch (id) {
    // ─── BICYCLE ────────────────────────────────────────────────────────────
    case 'bicycle':
      return (
        <G stroke={c} fill="none">
          {/* Rear wheel */}
          <Circle cx={11} cy={25} r={6} strokeWidth={1.6} />
          <Circle cx={11} cy={25} r={2} fill={c} stroke="none" opacity={0.5} />
          {/* Front wheel */}
          <Circle cx={45} cy={25} r={6} strokeWidth={1.6} />
          <Circle cx={45} cy={25} r={2} fill={c} stroke="none" opacity={0.5} />
          {/* Frame: rear hub → bottom bracket → front fork */}
          <Path d="M11,25 L23,10 L45,25 M23,10 L29,25 M11,25 L29,25" strokeWidth={1.5} />
          {/* Seat post + saddle */}
          <Path d="M23,10 L21,6 M19,6 L24,6" strokeWidth={1.4} strokeLinecap="round" />
          {/* Handlebars */}
          <Path d="M40,14 L45,14 M44,12 L44,16" strokeWidth={1.4} strokeLinecap="round" />
        </G>
      );

    // ─── MOTORBIKE ──────────────────────────────────────────────────────────
    case 'motorbike':
      return (
        <G stroke={c} fill="none">
          <Circle cx={12} cy={25} r={6} strokeWidth={1.6} />
          <Circle cx={12} cy={25} r={2} fill={c} stroke="none" opacity={0.5} />
          <Circle cx={44} cy={25} r={6} strokeWidth={1.6} />
          <Circle cx={44} cy={25} r={2} fill={c} stroke="none" opacity={0.5} />
          {/* Engine / body block */}
          <Rect x={20} y={15} width={16} height={8} rx={2} fill={c} stroke="none" opacity={0.25} />
          <Rect x={20} y={15} width={16} height={8} rx={2} strokeWidth={1.4} />
          {/* Frame lines */}
          <Path d="M12,25 L20,17 M28,17 L36,19 L44,25 M28,19 L28,25" strokeWidth={1.4} />
          {/* Rider silhouette */}
          <Path d="M26,15 L24,9 L30,9 L32,12 L28,15" fill={c} opacity={0.2} stroke={c} strokeWidth={1} />
          {/* Handlebars */}
          <Path d="M37,17 L42,15 M41,13 L41,17" strokeWidth={1.3} strokeLinecap="round" />
        </G>
      );

    // ─── SMALL CAR ──────────────────────────────────────────────────────────
    case 'small_car':
      return (
        <G stroke={c}>
          {/* Body */}
          <Path d="M4,22 L4,18 L12,10 L36,10 L44,18 L52,18 L52,22 Z"
            fill={c} fillOpacity={0.12} strokeWidth={1.5} />
          {/* Windscreen + rear screen */}
          <Path d="M14,10 L12,18 L26,18 L28,10 Z" fill={c} fillOpacity={0.3} stroke="none" />
          <Path d="M36,10 L36,18 L46,18 L44,14 Z" fill={c} fillOpacity={0.25} stroke="none" />
          {/* Window divider */}
          <Path d="M28,10 L28,18" strokeWidth={1} />
          <Wheel cx={13} cy={25} color={c} />
          <Wheel cx={43} cy={25} color={c} />
        </G>
      );

    // ─── LARGE CAR / SUV ─────────────────────────────────────────────────────
    case 'large_car':
      return (
        <G stroke={c}>
          {/* Body — taller, boxier than small_car */}
          <Path d="M3,22 L3,16 L10,8 L38,8 L46,16 L53,16 L53,22 Z"
            fill={c} fillOpacity={0.12} strokeWidth={1.5} />
          <Path d="M13,8 L10,16 L26,16 L28,8 Z" fill={c} fillOpacity={0.3} stroke="none" />
          <Path d="M37,8 L38,16 L46,16 L44,11 Z" fill={c} fillOpacity={0.25} stroke="none" />
          <Path d="M29,8 L28,16" stroke={c} strokeWidth={1} fill="none" />
          <Wheel cx={12} cy={25} color={c} />
          <Wheel cx={44} cy={25} color={c} />
        </G>
      );

    // ─── SHORT-WHEELBASE VAN ─────────────────────────────────────────────────
    case 'swb_van':
      return (
        <G stroke={c}>
          {/* Full-height box body with flat nose */}
          <Rect x={4} y={8} width={12} height={16} rx={1}
            fill={c} fillOpacity={0.2} strokeWidth={1.5} />
          <Rect x={16} y={8} width={32} height={16} rx={1}
            fill={c} fillOpacity={0.1} strokeWidth={1.5} />
          {/* Cab divider */}
          <Path d="M16,8 L16,24" strokeWidth={1} />
          {/* Windscreen */}
          <Path d="M6,10 L14,10 L14,18 L6,18 Z" fill={c} fillOpacity={0.3} stroke="none" />
          <Wheel cx={10} cy={25} color={c} />
          <Wheel cx={38} cy={25} color={c} />
        </G>
      );

    // ─── LONG-WHEELBASE VAN ──────────────────────────────────────────────────
    case 'lwb_van':
      return (
        <G stroke={c}>
          <Rect x={2} y={8} width={12} height={16} rx={1}
            fill={c} fillOpacity={0.2} strokeWidth={1.5} />
          <Rect x={14} y={8} width={40} height={16} rx={1}
            fill={c} fillOpacity={0.1} strokeWidth={1.5} />
          <Path d="M14,8 L14,24" strokeWidth={1} />
          <Path d="M4,10 L12,10 L12,18 L4,18 Z" fill={c} fillOpacity={0.3} stroke="none" />
          <Wheel cx={8} cy={25} color={c} />
          <Wheel cx={46} cy={25} color={c} />
        </G>
      );

    // ─── LUTON VAN (raised cab roof box) ────────────────────────────────────
    case 'luton_van':
      return (
        <G stroke={c}>
          {/* Raised cab box (Luton nose) */}
          <Rect x={2} y={4} width={16} height={12} rx={1}
            fill={c} fillOpacity={0.25} strokeWidth={1.5} />
          {/* Lower cab body */}
          <Rect x={2} y={16} width={16} height={8} rx={1}
            fill={c} fillOpacity={0.15} strokeWidth={1} />
          {/* Rear cargo body */}
          <Rect x={18} y={8} width={36} height={16} rx={1}
            fill={c} fillOpacity={0.1} strokeWidth={1.5} />
          {/* Luton overhang indicator */}
          <Path d="M2,12 L18,12 L18,8" stroke={c} strokeWidth={1} fill="none" strokeDasharray="2,1.5" />
          {/* Windscreen */}
          <Path d="M4,6 L14,6 L14,12 L4,12 Z" fill={c} fillOpacity={0.3} stroke="none" />
          <Wheel cx={10} cy={25} color={c} />
          <Wheel cx={44} cy={25} color={c} />
        </G>
      );

    // ─── TIPPER SWB ─────────────────────────────────────────────────────────
    case 'tipper_swb':
      return (
        <G stroke={c}>
          {/* Cab */}
          <Rect x={2} y={10} width={14} height={14} rx={1.5}
            fill={c} fillOpacity={0.2} strokeWidth={1.5} />
          {/* Tipper body (angled — raised at rear) */}
          <Path d="M16,24 L16,16 L38,10 L38,24 Z"
            fill={c} fillOpacity={0.12} strokeWidth={1.5} />
          {/* Hydraulic ram hint */}
          <Path d="M22,20 L26,16" strokeWidth={2} strokeLinecap="round" />
          {/* Cab window */}
          <Path d="M4,12 L12,12 L12,18 L4,18 Z" fill={c} fillOpacity={0.3} stroke="none" />
          <Wheel cx={9} cy={25} r={4.5} color={c} />
          <Wheel cx={30} cy={25} r={4.5} color={c} />
        </G>
      );

    // ─── TIPPER LWB ─────────────────────────────────────────────────────────
    case 'tipper_lwb':
      return (
        <G stroke={c}>
          <Rect x={2} y={10} width={14} height={14} rx={1.5}
            fill={c} fillOpacity={0.2} strokeWidth={1.5} />
          <Path d="M16,24 L16,15 L50,9 L50,24 Z"
            fill={c} fillOpacity={0.12} strokeWidth={1.5} />
          <Path d="M26,20 L30,15" strokeWidth={2} strokeLinecap="round" />
          <Path d="M4,12 L12,12 L12,18 L4,18 Z" fill={c} fillOpacity={0.3} stroke="none" />
          <Wheel cx={9} cy={25} r={4.5} color={c} />
          <Wheel cx={42} cy={25} r={4.5} color={c} />
        </G>
      );

    // ─── 7.5t RIGID ─────────────────────────────────────────────────────────
    case '7_5t_rigid':
      return (
        <G stroke={c}>
          {/* Cab */}
          <Rect x={2} y={10} width={14} height={16} rx={1.5}
            fill={c} fillOpacity={0.25} strokeWidth={1.5} />
          {/* Box body */}
          <Rect x={16} y={8} width={36} height={16} rx={1}
            fill={c} fillOpacity={0.1} strokeWidth={1.5} />
          <Path d="M4,12 L13,12 L13,18 L4,18 Z" fill={c} fillOpacity={0.3} stroke="none" />
          <Wheel cx={9} cy={27} r={5} color={c} />
          <Wheel cx={44} cy={27} r={5} color={c} />
        </G>
      );

    // ─── 18t RIGID ──────────────────────────────────────────────────────────
    case '18t_rigid':
      return (
        <G stroke={c}>
          <Rect x={2} y={10} width={14} height={16} rx={1.5}
            fill={c} fillOpacity={0.25} strokeWidth={1.5} />
          <Rect x={16} y={8} width={36} height={16} rx={1}
            fill={c} fillOpacity={0.1} strokeWidth={1.5} />
          <Path d="M4,12 L13,12 L13,18 L4,18 Z" fill={c} fillOpacity={0.3} stroke="none" />
          {/* Twin rear axle */}
          <Wheel cx={9} cy={27} r={4.5} color={c} />
          <Wheel cx={36} cy={27} r={4.5} color={c} />
          <Wheel cx={46} cy={27} r={4.5} color={c} />
        </G>
      );

    // ─── 26t RIGID ──────────────────────────────────────────────────────────
    case '26t_rigid':
      return (
        <G stroke={c}>
          <Rect x={2} y={10} width={14} height={16} rx={1.5}
            fill={c} fillOpacity={0.25} strokeWidth={1.5} />
          <Rect x={16} y={8} width={36} height={16} rx={1}
            fill={c} fillOpacity={0.1} strokeWidth={1.5} />
          <Path d="M4,12 L13,12 L13,18 L4,18 Z" fill={c} fillOpacity={0.3} stroke="none" />
          {/* Three axles */}
          <Wheel cx={9} cy={27} r={4.5} color={c} />
          <Wheel cx={30} cy={27} r={4.5} color={c} />
          <Wheel cx={40} cy={27} r={4.5} color={c} />
          <Wheel cx={50} cy={27} r={4.5} color={c} />
        </G>
      );

    // ─── ARTIC 13.6m ────────────────────────────────────────────────────────
    case 'artic_13_6m':
      return (
        <G stroke={c}>
          {/* Tractor unit */}
          <Rect x={2} y={11} width={12} height={14} rx={1.5}
            fill={c} fillOpacity={0.3} strokeWidth={1.5} />
          {/* Coupling */}
          <Circle cx={14} cy={22} r={2.5} fill={c} fillOpacity={0.6} stroke="none" />
          {/* Trailer */}
          <Rect x={16} y={9} width={38} height={14} rx={1}
            fill={c} fillOpacity={0.1} strokeWidth={1.5} />
          <Path d="M4,13 L12,13 L12,19 L4,19 Z" fill={c} fillOpacity={0.3} stroke="none" />
          <Wheel cx={7} cy={27} r={4} color={c} />
          <Wheel cx={22} cy={27} r={4} color={c} />
          <Wheel cx={44} cy={27} r={4} color={c} />
          <Wheel cx={52} cy={27} r={4} color={c} />
        </G>
      );

    // ─── ARTIC 15.5m ────────────────────────────────────────────────────────
    case 'artic_15_5m':
      return (
        <G stroke={c}>
          <Rect x={1} y={12} width={11} height={13} rx={1.5}
            fill={c} fillOpacity={0.3} strokeWidth={1.5} />
          <Circle cx={12} cy={22} r={2} fill={c} fillOpacity={0.6} stroke="none" />
          {/* Extra-long trailer */}
          <Rect x={14} y={9} width={41} height={14} rx={1}
            fill={c} fillOpacity={0.1} strokeWidth={1.5} />
          <Path d="M3,14 L10,14 L10,19 L3,19 Z" fill={c} fillOpacity={0.3} stroke="none" />
          <Wheel cx={6} cy={27} r={3.5} color={c} />
          <Wheel cx={20} cy={27} r={3.5} color={c} />
          <Wheel cx={44} cy={27} r={3.5} color={c} />
          <Wheel cx={52} cy={27} r={3.5} color={c} />
        </G>
      );

    // ─── CAR + TRAILER ──────────────────────────────────────────────────────
    case 'car_trailer':
      return (
        <G stroke={c}>
          {/* Car */}
          <Path d="M2,22 L2,16 L8,10 L24,10 L30,16 L34,16 L34,22 Z"
            fill={c} fillOpacity={0.12} strokeWidth={1.5} />
          <Path d="M10,10 L9,16 L20,16 L22,10 Z" fill={c} fillOpacity={0.3} stroke="none" />
          <Wheel cx={8} cy={25} r={4.5} color={c} />
          <Wheel cx={28} cy={25} r={4.5} color={c} />
          {/* Tow bar */}
          <Path d="M34,21 L38,21" strokeWidth={2} strokeLinecap="round" />
          {/* Trailer */}
          <Rect x={38} y={14} width={16} height={8} rx={1}
            fill={c} fillOpacity={0.1} strokeWidth={1.5} />
          <Wheel cx={46} cy={25} r={4} color={c} />
        </G>
      );

    // ─── HORSE TRAILER ──────────────────────────────────────────────────────
    case 'horse_trailer':
      return (
        <G stroke={c}>
          {/* Van */}
          <Rect x={2} y={10} width={16} height={14} rx={1.5}
            fill={c} fillOpacity={0.2} strokeWidth={1.5} />
          <Path d="M4,12 L14,12 L14,18 L4,18 Z" fill={c} fillOpacity={0.3} stroke="none" />
          <Wheel cx={7} cy={25} r={4.5} color={c} />
          <Wheel cx={16} cy={25} r={4.5} color={c} />
          {/* Tow bar */}
          <Path d="M18,22 L22,22" strokeWidth={2} strokeLinecap="round" />
          {/* Horse trailer (tall, ventilation slats) */}
          <Rect x={22} y={7} width={32} height={17} rx={1}
            fill={c} fillOpacity={0.1} strokeWidth={1.5} />
          <Path d="M26,9 L26,24 M30,9 L30,24 M34,9 L34,24 M38,9 L38,24 M42,9 L42,24"
            stroke={c} strokeWidth={0.7} opacity={0.5} />
          <Wheel cx={32} cy={25} r={4} color={c} />
          <Wheel cx={46} cy={25} r={4} color={c} />
        </G>
      );

    // ─── CARAVAN ────────────────────────────────────────────────────────────
    case 'caravan_7m':
      return (
        <G stroke={c}>
          {/* Car */}
          <Path d="M2,22 L2,16 L8,10 L22,10 L28,16 L32,16 L32,22 Z"
            fill={c} fillOpacity={0.12} strokeWidth={1.5} />
          <Path d="M10,10 L8,16 L20,16 L22,10 Z" fill={c} fillOpacity={0.3} stroke="none" />
          <Wheel cx={8} cy={25} r={4} color={c} />
          <Wheel cx={26} cy={25} r={4} color={c} />
          {/* Tow bar */}
          <Path d="M32,21 L36,21" strokeWidth={2} strokeLinecap="round" />
          {/* Caravan — rounded, taller */}
          <Path d="M36,8 Q36,6 38,6 L52,6 Q54,6 54,8 L54,22 L36,22 Z"
            fill={c} fillOpacity={0.1} strokeWidth={1.5} />
          <Rect x={40} y={8} width={8} height={6} rx={1} fill={c} fillOpacity={0.3} stroke="none" />
          <Wheel cx={44} cy={25} r={4} color={c} />
        </G>
      );

    // ─── MINIBUS ────────────────────────────────────────────────────────────
    case 'minibus':
      return (
        <G stroke={c}>
          <Rect x={2} y={8} width={52} height={16} rx={2.5}
            fill={c} fillOpacity={0.12} strokeWidth={1.5} />
          {/* Windscreen */}
          <Rect x={4} y={10} width={10} height={10} rx={1} fill={c} fillOpacity={0.3} stroke="none" />
          {/* Passenger windows */}
          <Rect x={16} y={10} width={8} height={8} rx={1} fill={c} fillOpacity={0.25} stroke="none" />
          <Rect x={26} y={10} width={8} height={8} rx={1} fill={c} fillOpacity={0.25} stroke="none" />
          <Rect x={36} y={10} width={8} height={8} rx={1} fill={c} fillOpacity={0.25} stroke="none" />
          <Rect x={46} y={10} width={6} height={8} rx={1} fill={c} fillOpacity={0.2} stroke="none" />
          <Wheel cx={10} cy={26} r={5} color={c} />
          <Wheel cx={46} cy={26} r={5} color={c} />
        </G>
      );

    // ─── COACH ──────────────────────────────────────────────────────────────
    case 'coach':
      return (
        <G stroke={c}>
          {/* Long low-roofline body */}
          <Path d="M2,9 Q2,7 4,7 L52,7 Q54,7 54,9 L54,24 Q54,26 52,26 L4,26 Q2,26 2,24 Z"
            fill={c} fillOpacity={0.1} strokeWidth={1.5} />
          {/* Tinted windscreen band */}
          <Path d="M2,9 L2,14 L54,14 L54,9 Z" fill={c} fillOpacity={0.3} stroke="none" />
          {/* Side windows */}
          <Rect x={4}  y={15} width={7} height={7} rx={0.5} fill={c} fillOpacity={0.25} stroke="none" />
          <Rect x={14} y={15} width={7} height={7} rx={0.5} fill={c} fillOpacity={0.25} stroke="none" />
          <Rect x={24} y={15} width={7} height={7} rx={0.5} fill={c} fillOpacity={0.25} stroke="none" />
          <Rect x={34} y={15} width={7} height={7} rx={0.5} fill={c} fillOpacity={0.25} stroke="none" />
          <Rect x={44} y={15} width={7} height={7} rx={0.5} fill={c} fillOpacity={0.2} stroke="none" />
          {/* Three axles (dual rear) */}
          <Wheel cx={10} cy={28} r={4} color={c} />
          <Wheel cx={42} cy={28} r={4} color={c} />
          <Wheel cx={50} cy={28} r={4} color={c} />
        </G>
      );

    default:
      return (
        <Rect x={8} y={10} width={40} height={14} rx={3}
          fill={c} fillOpacity={0.15} stroke={c} strokeWidth={1.5} />
      );
  }
}
