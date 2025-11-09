export interface Track {
  id: number;
  title: string;
  artist: string;
  audioSrc: string;
  coverArt: string;
  description?: string;
  releaseDate?: string;
  genre?: string;
}