import { Component, ChangeDetectionStrategy, signal, effect, inject, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Track } from './models/track.model';
import { GeminiService } from './services/gemini.service';
import { StorageService } from './services/storage.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
})
export class AppComponent {
  @ViewChild('audioPlayer') audioPlayerRef!: ElementRef<HTMLAudioElement>;
  geminiService = inject(GeminiService);
  storageService = inject(StorageService);

  // Playlist State
  playlist = signal<Track[]>([
    { id: 1, title: 'Midnight City', artist: 'M83', audioSrc: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3', coverArt: 'https://picsum.photos/seed/midnight/200' },
    { id: 2, title: 'Intro', artist: 'The xx', audioSrc: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3', coverArt: 'https://picsum.photos/seed/intro/200' },
    { id: 3, title: 'Genesis', artist: 'Grimes', audioSrc: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3', coverArt: 'https://picsum.photos/seed/genesis/200' },
    { id: 4, title: 'Electric Feel', artist: 'MGMT', audioSrc: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3', coverArt: 'https://picsum.photos/seed/electric/200' },
  ]);
  
  // Player State
  currentTrack = signal<Track | null>(null);
  isPlaying = signal(false);
  currentTime = signal(0);
  duration = signal(0);
  volume = signal(0.75);

  // Upload State
  isUploading = signal(false);
  isDragging = signal(false);
  isDraggingCover = signal(false);
  isSavingTrack = signal(false);
  newTrackTitle = signal('');
  newTrackArtist = signal('');
  newTrackFile = signal<File | null>(null);
  newTrackCoverFile = signal<File | null>(null);
  newTrackCoverArt = signal<string>('https://picsum.photos/seed/newtrack/200');
  newTrackReleaseDate = signal('');
  newTrackGenre = signal('');
  generatedDescription = signal('');
  isGeneratingDescription = signal(false);
  uploadError = signal<string | null>(null);
  coverArtError = signal<string | null>(null);

  // Ad State
  songsPlayedCounter = signal(0);
  showAd = signal(false);
  wasPlayingBeforeAd = signal(false);

  constructor() {
    effect(() => {
      const track = this.currentTrack();
      if (track) {
        const audio = this.audioPlayerRef.nativeElement;
        audio.src = track.audioSrc;
        audio.load();
        if (this.isPlaying()) {
          audio.play().catch(e => console.error("Error playing audio:", e));
        }
      }
    });

    effect(() => {
        const audio = this.audioPlayerRef?.nativeElement;
        if (!audio) return;
        if (this.isPlaying()) {
            audio.play().catch(e => console.error("Error playing audio:", e));
        } else {
            audio.pause();
        }
    });
  }

  selectTrack(track: Track): void {
    if (this.currentTrack()?.id === track.id) {
        this.togglePlay();
    } else {
        this.currentTrack.set(track);
        this.isPlaying.set(true);
        this.handleTrackPlayback();
    }
  }

  togglePlay(): void {
    if (this.currentTrack()) {
        this.isPlaying.update(p => !p);
    } else if (this.playlist().length > 0) {
        this.selectTrack(this.playlist()[0]);
    }
  }

  onTimeUpdate(event: Event): void {
    const audio = event.target as HTMLAudioElement;
    this.currentTime.set(audio.currentTime);
    this.duration.set(audio.duration);
  }

  onEnded(): void {
    this.nextTrack();
  }

  seek(event: MouseEvent): void {
    if (!this.duration()) return;
    const progressBar = (event.currentTarget as HTMLElement);
    const rect = progressBar.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const width = rect.width;
    const percentage = x / width;
    const newTime = this.duration() * percentage;
    this.audioPlayerRef.nativeElement.currentTime = newTime;
    this.currentTime.set(newTime);
  }

  setVolume(event: Event): void {
    const newVolume = parseFloat((event.target as HTMLInputElement).value);
    this.volume.set(newVolume);
    this.audioPlayerRef.nativeElement.volume = newVolume;
  }

  formatTime(seconds: number): string {
    if (isNaN(seconds) || seconds < 0) return '0:00';
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${minutes}:${secs < 10 ? '0' : ''}${secs}`;
  }
  
  private changeTrack(direction: 1 | -1): void {
    const current = this.currentTrack();
    if (!current) return;
    const tracks = this.playlist();
    const currentIndex = tracks.findIndex(t => t.id === current.id);
    if (currentIndex === -1) return;

    let nextIndex = (currentIndex + direction + tracks.length) % tracks.length;
    this.selectTrack(tracks[nextIndex]);
  }

  nextTrack = () => this.changeTrack(1);
  prevTrack = () => this.changeTrack(-1);

  // --- Ad Logic ---
  private handleTrackPlayback(): void {
    const newCount = this.songsPlayedCounter() + 1;
    this.songsPlayedCounter.set(newCount);

    if (newCount > 0 && newCount % 20 === 0) {
        this.wasPlayingBeforeAd.set(true);
        this.isPlaying.set(false);
        this.showAd.set(true);
    }
  }

  closeAd(): void {
    this.showAd.set(false);
    if (this.wasPlayingBeforeAd()) {
        this.isPlaying.set(true);
    }
  }

  // --- Upload Logic ---
  onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging.set(true);
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging.set(false);
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging.set(false);
    if (event.dataTransfer?.files && event.dataTransfer.files.length > 0) {
      this.handleFileSelect(event.dataTransfer.files);
    }
  }

  handleFileSelect(files: FileList | null): void {
    const file = files?.[0];
    const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024; // 15MB

    if (!file) return;

    if (file.size > MAX_FILE_SIZE_BYTES) {
        this.uploadError.set(`File is too large. Maximum size is 15MB.`);
        this.newTrackFile.set(null);
        return;
    }

    if (file.type.startsWith('audio/')) {
      this.newTrackFile.set(file);
      this.uploadError.set(null);
      
      const fileName = file.name.replace(/\.[^/.]+$/, "");
      const parts = fileName.split(' - ');
      if (parts.length === 2) {
          this.newTrackArtist.set(parts[0].trim());
          this.newTrackTitle.set(parts[1].trim());
      } else {
          this.newTrackTitle.set(fileName.trim());
      }
    } else {
      this.uploadError.set('Please select or drop a valid audio file.');
      this.newTrackFile.set(null);
    }
  }

  removeFile(): void {
    this.newTrackFile.set(null);
    this.uploadError.set(null);
  }

  // --- Cover Art Upload ---
  onCoverArtDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDraggingCover.set(true);
  }

  onCoverArtDragLeave(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDraggingCover.set(false);
  }

  onCoverArtDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDraggingCover.set(false);
    if (event.dataTransfer?.files && event.dataTransfer.files.length > 0) {
      this.handleCoverArtSelect(event.dataTransfer.files);
    }
  }

  handleCoverArtSelect(files: FileList | null): void {
    const file = files?.[0];
    const MAX_COVER_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

    if (!file) return;

    if (!file.type.startsWith('image/')) {
      this.coverArtError.set('Please select a valid image file.');
      this.newTrackCoverFile.set(null);
      return;
    }
    
    if (file.size > MAX_COVER_SIZE_BYTES) {
      this.coverArtError.set(`Image is too large. Maximum size is 5MB.`);
      this.newTrackCoverFile.set(null);
      return;
    }
    
    this.newTrackCoverFile.set(file);
    this.newTrackCoverArt.set(URL.createObjectURL(file));
    this.coverArtError.set(null);
  }

  removeCoverArt(): void {
    const currentCoverUrl = this.newTrackCoverArt();
    if (currentCoverUrl.startsWith('blob:')) {
      URL.revokeObjectURL(currentCoverUrl);
    }
    this.newTrackCoverFile.set(null);
    this.newTrackCoverArt.set('https://picsum.photos/seed/newtrack/200');
    this.coverArtError.set(null);
  }


  async generateDescription(): Promise<void> {
    if (this.isGeneratingDescription()) return;
    this.isGeneratingDescription.set(true);
    try {
      const description = await this.geminiService.generateTrackDescription(this.newTrackTitle(), this.newTrackArtist());
      this.generatedDescription.set(description);
    } catch (e) {
      // Error is handled by the service signal
    } finally {
      this.isGeneratingDescription.set(false);
    }
  }

  async addTrackToPlaylist(): Promise<void> {
    const file = this.newTrackFile();
    const coverFile = this.newTrackCoverFile();
    const title = this.newTrackTitle();
    const artist = this.newTrackArtist();

    if (!file || !title.trim() || !artist.trim()) {
      this.uploadError.set('Please fill in title, artist, and select an audio file.');
      return;
    }

    this.isSavingTrack.set(true);
    this.uploadError.set(null);

    try {
      // Upload audio and cover art files concurrently
      const uploadPromises: Promise<string | null>[] = [
        this.storageService.uploadFile(file),
        coverFile ? this.storageService.uploadFile(coverFile) : Promise.resolve(null),
      ];

      const [audioUrl, coverArtUrl] = await Promise.all(uploadPromises);

      if (!audioUrl) {
          throw new Error('Audio file upload failed.');
      }

      const newTrack: Track = {
        id: Date.now(),
        title: title,
        artist: artist,
        audioSrc: audioUrl,
        coverArt: coverArtUrl 
          ? coverArtUrl 
          : `https://picsum.photos/seed/${encodeURIComponent(title)}/200`,
        description: this.generatedDescription(),
        releaseDate: this.newTrackReleaseDate(),
        genre: this.newTrackGenre(),
      };
      
      this.playlist.update(p => [...p, newTrack]);
      this.isUploading.set(false);
      this.resetUploadForm();
      this.selectTrack(newTrack);

    } catch (error) {
      console.error('Upload failed:', error);
      this.uploadError.set('Something went wrong during the upload. Please try again.');
    } finally {
      this.isSavingTrack.set(false);
    }
  }

  resetUploadForm(): void {
    this.newTrackFile.set(null);
    this.newTrackTitle.set('');
    this.newTrackArtist.set('');
    this.newTrackReleaseDate.set('');
    this.newTrackGenre.set('');
    this.generatedDescription.set('');
    this.uploadError.set(null);
    this.isDragging.set(false);
    this.isDraggingCover.set(false);
    this.isSavingTrack.set(false);
    this.removeCoverArt();
  }

  cancelUpload(): void {
    this.isUploading.set(false);
    this.resetUploadForm();
  }
}
