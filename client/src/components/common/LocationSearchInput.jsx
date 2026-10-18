import React, { useState, useEffect, useRef } from 'react';
import { Search, Loader2, MapPin, X, CheckCircle, AlertCircle } from 'lucide-react';
import Badge from './Badge';

export default function LocationSearchInput({
  label,
  id,
  icon: Icon = MapPin,
  placeholder = 'Search place or address in Mumbai MMR...',
  value,
  onChangeText,
  onSelectPlace,
  selectedTerritory,
  selectedCoords,
  error,
  required = false,
  apiBaseUrl = 'http://localhost:5000/api',
}) {
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [searchMessage, setSearchMessage] = useState('');
  const wrapperRef = useRef(null);
  const debounceTimerRef = useRef(null);
  const searchGenerationRef = useRef(0);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => () => {
    searchGenerationRef.current += 1;
    clearTimeout(debounceTimerRef.current);
  }, []);

  // Fetch suggestions with debouncing
  const handleInputChange = (e) => {
    const text = e.target.value;
    const searchGeneration = ++searchGenerationRef.current;
    onChangeText(text);

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    if (!text || text.trim().length < 2) {
      setSuggestions([]);
      setIsOpen(false);
      setLoading(false);
      setSearchMessage('');
      return;
    }

    setSuggestions([]);
    setIsOpen(false);
    setLoading(true);
    setSearchMessage('');
    debounceTimerRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`${apiBaseUrl}/bookings/places?q=${encodeURIComponent(text.trim())}`);
        const json = await res.json();
        if (searchGeneration !== searchGenerationRef.current) return;
        if (!res.ok || !json.success) {
          throw new Error(json.error?.message || 'Location search is temporarily unavailable.');
        }
        const results = Array.isArray(json.data) ? json.data : [];
        setSuggestions(results);
        setIsOpen(true);
        setSearchMessage(results.length === 0 ? 'No matching locations found. Try a nearby landmark.' : '');
      } catch (error) {
        if (searchGeneration !== searchGenerationRef.current) return;
        setSuggestions([]);
        setIsOpen(true);
        setSearchMessage(error.message || 'Location search is temporarily unavailable.');
      } finally {
        if (searchGeneration === searchGenerationRef.current) setLoading(false);
      }
    }, 280);
  };

  const handleSelectSuggestion = (place) => {
    searchGenerationRef.current += 1;
    clearTimeout(debounceTimerRef.current);
    setLoading(false);
    setIsOpen(false);
    setSuggestions([]);
    setSearchMessage('');
    onSelectPlace(place);
  };

  const handleClear = () => {
    searchGenerationRef.current += 1;
    clearTimeout(debounceTimerRef.current);
    setLoading(false);
    onChangeText('');
    setSuggestions([]);
    setIsOpen(false);
    setSearchMessage('');
    onSelectPlace(null);
  };

  return (
    <div ref={wrapperRef} className="w-full relative space-y-1">
      {label && (
        <label
          htmlFor={id}
          className="block text-xs font-semibold text-theme-text uppercase tracking-wider"
        >
          {label} {required && <span className="text-red-500">*</span>}
        </label>
      )}

      <div className="relative rounded-lg">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-theme-text-secondary">
          <Icon className="w-4 h-4" />
        </div>

        <input
          id={id}
          type="text"
          value={value}
          onChange={handleInputChange}
          onFocus={() => {
            if (suggestions.length > 0 || searchMessage) setIsOpen(true);
          }}
          placeholder={placeholder}
          required={required}
          autoComplete="off"
          className={`w-full rounded-lg border bg-theme-input text-theme-text placeholder-theme-text-secondary text-xs sm:text-sm py-2.5 pl-9 pr-14 transition-colors focus:outline-none focus:ring-2 focus:ring-theme-primary focus:border-transparent ${
            error ? 'border-red-500 focus:ring-red-500' : 'border-theme-border'
          }`}
        />

        <div className="absolute inset-y-0 right-0 pr-2.5 flex items-center gap-1">
          {loading && (
            <Loader2 className="w-4 h-4 text-theme-primary animate-spin" />
          )}
          {value && !loading && (
            <button
              type="button"
              onClick={handleClear}
              className="p-1 text-theme-text-secondary hover:text-theme-text rounded-md transition-colors"
              title="Clear input"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Autocomplete Suggestions Popup */}
      {isOpen && (suggestions.length > 0 || searchMessage) && (
        <div className="absolute z-50 left-0 right-0 mt-1 bg-theme-card border border-theme-border rounded-lg shadow-2xl overflow-hidden max-h-64 overflow-y-auto divide-y divide-theme-border/60">
          <div className="px-3 py-1.5 bg-theme-surface/60 text-[10px] font-medium text-theme-text-secondary uppercase tracking-wider flex items-center justify-between">
            <span>{suggestions.length ? `Verified MMR Places (${suggestions.length})` : 'Location Search'}</span>
            <span>OSM / Road Network</span>
          </div>
          {suggestions.map((item) => (
            <div
              key={item.placeId}
              onClick={() => handleSelectSuggestion(item)}
              className="px-3.5 py-2.5 hover:bg-theme-surface/70 cursor-pointer transition-colors flex items-start justify-between gap-3 text-left"
            >
              <div className="flex items-start gap-2.5 min-w-0">
                <MapPin className="w-4 h-4 text-theme-primary flex-shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <div className="text-xs font-medium text-theme-text truncate">
                    {item.name}
                  </div>
                  <div className="text-[11px] text-theme-text-secondary truncate mt-0.5">
                    {item.address}
                  </div>
                </div>
              </div>
              <Badge variant="purple" size="sm" className="flex-shrink-0">
                {item.territory}
              </Badge>
            </div>
          ))}
          {searchMessage && (
            <p className="px-3.5 py-2.5 text-xs text-theme-text-secondary">
              {searchMessage}
            </p>
          )}
        </div>
      )}

      {/* Territory & Coordinate Confirmation Pill */}
      {selectedTerritory && selectedCoords && (
        <div className="flex items-center justify-between text-[11px] text-theme-text-secondary pt-0.5 px-0.5">
          <div className="flex items-center gap-1.5 text-emerald-400">
            <CheckCircle className="w-3.5 h-3.5 flex-shrink-0" />
            <span>Territory: <strong className="text-theme-text">{selectedTerritory}</strong></span>
          </div>
          <span className="font-mono text-[10px] text-theme-text-secondary">
            {Number(selectedCoords.lat).toFixed(4)}°, {Number(selectedCoords.lng).toFixed(4)}°
          </span>
        </div>
      )}

      {/* Validation Error Message */}
      {error && (
        <div className="flex items-center gap-1.5 text-red-400 text-[11px] pt-0.5 px-0.5">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
