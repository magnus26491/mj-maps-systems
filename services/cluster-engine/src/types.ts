/**
 * Cluster Engine — types
 *
 * The cluster engine solves the #1 driver complaint: backtracking.
 * It groups stops into geographical neighbourhoods (clusters) and
 * orders clusters so the driver sweeps through one area completely
 * before moving to the next — eliminating the "drive past, come back later"
 * pattern that current apps produce.
 *
 * Algorithm: DBSCAN (Density-Based Spatial Clustering) with
 * haversine distance metric, then nearest-neighbour cluster ordering
 * from depot, then within each cluster: side-of-road sorted sequence.
 */

export interface ClusterStop {
  id:      string;
  lat:     number;
  lng:     number;
  address: string;
  notes?:  string | null;
  parcelCount?: number;
  // Added by cluster engine:
  clusterId?:       number;   // -1 = noise (isolated stop, its own cluster)
  clusterIndex?:    number;   // Execution order within cluster
  approachBearing?: number;   // Degrees — optimal approach direction
  sideOfRoad?:      'left' | 'right' | 'either';
}

export interface Cluster {
  id:         number;
  centroidLat: number;
  centroidLng: number;
  stops:       ClusterStop[];
  orderIndex:  number;   // Which cluster to service first, second, etc.
}

export interface ClusterEngineConfig {
  /** DBSCAN epsilon: max distance between stops in same cluster (metres). Default 400m */
  epsilonMetres:    number;
  /** DBSCAN min points: minimum stops to form a cluster. Default 2. */
  minPoints:        number;
  /** Depot coordinates for cluster ordering origin */
  depotLat:         number;
  depotLng:         number;
  /** If true, attempt to sort within-cluster stops by side of road to minimise cross-traffic */
  sideOfRoadSort:   boolean;
}

export interface ClusterResult {
  clusters:        Cluster[];
  orderedStops:    ClusterStop[];   // Flat ordered list ready to feed route-engine
  totalClusters:   number;
  noiseStops:      number;          // Isolated stops not in any cluster
  estimatedBacktrackReductionPct: number;
}
