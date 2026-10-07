import useFetch from './useFetch';
import { productApi, supplierApi } from '../services/api';

// Lists used to fill <select> boxes.
export function useProductOptions(deps = []) {
  const { data, loading, error, reload } = useFetch(() => productApi.list({ limit: 200, sort: 'name' }), deps);
  return { products: data ? data.data : [], loading, error, reload };
}

export function useSupplierOptions() {
  const { data, loading } = useFetch(() => supplierApi.list({ limit: 200 }), []);
  return { suppliers: data ? data.data : [], loading };
}

export function useCategoryOptions(deps = []) {
  const { data } = useFetch(() => productApi.categories(), deps);
  return data ? data.data : [];
}
