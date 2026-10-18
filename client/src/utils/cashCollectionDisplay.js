export function getCashCollectionDisplayStatus(paymentMethod, collectionStatus) {
  if (paymentMethod !== 'Cash') {
    return null;
  }

  if (collectionStatus === 'OUTSTANDING' || collectionStatus === 'COLLECTED') {
    return collectionStatus;
  }

  return 'UNVERIFIED';
}
