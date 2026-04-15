import { useEffect } from 'react';
import { useReadabilityStore } from '../stores/readabilityStore';

export const ReadabilityInitializer = () => {
  const { hydrate } = useReadabilityStore();

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  return null;
};
