export interface ProductionBuildStatus {
  dist_present: boolean;
  served_by_fastapi: boolean;
  index_html: string;
}
