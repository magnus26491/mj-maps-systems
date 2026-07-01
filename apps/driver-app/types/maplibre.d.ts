declare module '@maplibre/maplibre-react-native' {
  import type { ComponentType, ReactNode } from 'react';
  import type { ViewStyle } from 'react-native';

  export const UserTrackingMode: {
    Follow: string;
    FollowWithHeading: string;
    FollowWithCourse: string;
  };

  export interface CameraProps {
    zoomLevel?: number;
    centerCoordinate?: [number, number];
    followUserLocation?: boolean;
    followUserMode?: string;
    followZoomLevel?: number;
    followPitch?: number;
    animationDuration?: number;
    animationMode?: string;
    pitch?: number;
    heading?: number;
    defaultSettings?: {
      centerCoordinate?: [number, number];
      zoomLevel?: number;
      pitch?: number;
      heading?: number;
    };
    bounds?: {
      ne: [number, number];
      sw: [number, number];
      paddingTop?: number;
      paddingBottom?: number;
      paddingLeft?: number;
      paddingRight?: number;
    };
    ref?: any;
  }
  export const Camera: ComponentType<CameraProps> & { any?: any };

  export interface MapViewProps {
    style?: ViewStyle;
    styleURL?: string;
    mapStyle?: string;
    logoEnabled?: boolean;
    attributionEnabled?: boolean;
    compassEnabled?: boolean;
    onDidFinishLoadingMap?: () => void;
    onPress?: (feature: any) => void;
    children?: ReactNode;
    ref?: any;
  }
  export const MapView: ComponentType<MapViewProps>;

  export interface UserLocationProps {
    visible?: boolean;
    renderMode?: string;
    animated?: boolean;
    showsUserHeadingIndicator?: boolean;
    onUpdate?: (location: any) => void;
    minDisplacement?: number;
  }
  export const UserLocation: ComponentType<UserLocationProps>;

  export interface ShapeSourceProps {
    id: string;
    shape?: any;
    children?: ReactNode;
  }
  export const ShapeSource: ComponentType<ShapeSourceProps>;

  export interface LineLayerProps {
    id: string;
    style?: Record<string, any>;
  }
  export const LineLayer: ComponentType<LineLayerProps>;

  export interface FillExtrusionLayerProps {
    id: string;
    sourceID?: string;
    minZoomLevel?: number;
    style?: Record<string, any>;
  }
  export const FillExtrusionLayer: ComponentType<FillExtrusionLayerProps>;

  export interface MarkerViewProps {
    coordinate: [number, number];
    children?: ReactNode;
    anchor?: { x: number; y: number };
  }
  export const MarkerView: ComponentType<MarkerViewProps>;

  export interface OfflinePack {
    name:     string;
    bounds:   [[number, number], [number, number]];
    minZoom:  number;
    maxZoom:  number;
    styleURL: string;
  }

  export const offlineManager: {
    createPack(
      options: OfflinePack,
      progressListener?: (pack: any, status: any) => void,
      errorListener?: (pack: any, error: any) => void,
    ): Promise<void>;
    deletePack(name: string): Promise<void>;
    getPacks(): Promise<any[]>;
  };
}
