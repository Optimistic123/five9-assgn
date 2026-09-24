export interface Rocket {
  id: string;
  name: string;
}

export interface Launch {
  id: string;
  name: string;
  date_utc: string;
  details: string | null;
  rocket: Rocket;
  links: { patch: { small: string | null } };
}

/** Where a response came from: the live SpaceX API or the bundled offline snapshot. */
export type DataSource = 'live' | 'snapshot';

export interface LaunchPage {
  docs: Launch[];
  page: number;
  totalPages: number;
  hasNextPage: boolean;
  source: DataSource;
}
