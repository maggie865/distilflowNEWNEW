import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import ProtectedRoute from '@/components/ProtectedRoute';
import Login from '@/pages/Login';
import Register from '@/pages/Register';
import ForgotPassword from '@/pages/ForgotPassword';
import ResetPassword from '@/pages/ResetPassword';
import AppLayout from '@/components/layout/AppLayout';
import Dashboard from '@/pages/Dashboard';
import Receiving from '@/pages/Receiving';
import Dilutions from '@/pages/Dilutions';
import Distillation from '@/pages/Distillation';
import Bottling from '@/pages/Bottling';
import Inventory from '@/pages/Inventory';
import RawMaterials from '@/pages/RawMaterials';
import BatchTracker from '@/pages/BatchTracker';
import Tanks from '@/pages/Tanks';
import Recipes from '@/pages/Recipes';
import BottlingFloor from '@/pages/BottlingFloor';
import Sales from '@/pages/Sales';
import Customers from '@/pages/Customers';
import Warehouse from '@/pages/Warehouse';
import Reports from '@/pages/Reports';
import Settings from '@/pages/Settings';
import SNSDistillation from '@/pages/SNSDistillation';
import StockTakes from '@/pages/StockTakes.jsx';
import Suppliers from '@/pages/Suppliers';

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();

  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      navigateToLogin();
      return null;
    }
  }

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route element={<ProtectedRoute unauthenticatedElement={<Navigate to="/login" replace />} />}>
        <Route element={<AppLayout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/receiving" element={<Receiving />} />
          <Route path="/dilutions" element={<Dilutions />} />
          <Route path="/distillation" element={<Distillation />} />
          <Route path="/bottling" element={<Bottling />} />
          <Route path="/inventory" element={<Inventory />} />
          <Route path="/raw-materials" element={<RawMaterials />} />
          <Route path="/batch-tracker" element={<BatchTracker />} />
          <Route path="/tanks" element={<Tanks />} />
          <Route path="/recipes" element={<Recipes />} />
          <Route path="/bottling-floor" element={<BottlingFloor />} />
          <Route path="/sales" element={<Sales />} />
          <Route path="/customers" element={<Customers />} />
          <Route path="/warehouse" element={<Warehouse />} />
          <Route path="/sns-distillation" element={<SNSDistillation />} />
          <Route path="/stock-takes" element={<StockTakes />} />
          <Route path="/suppliers" element={<Suppliers />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/settings" element={<Settings />} />
        </Route>
      </Route>
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};

function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <AuthenticatedApp />
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App