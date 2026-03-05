import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, Lock, ArrowLeft } from 'lucide-react';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { useApp } from '../context/AppContext';

export function RegisterPage() {
  const navigate = useNavigate();
  const { register, checkName } = useApp();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [nameAvailable, setNameAvailable] = useState<boolean | null>(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // check name availability as user types (debounced)
  useEffect(() => {
    let t: any = null;
    if (!name) {
      setNameAvailable(null);
      return;
    }
    t = setTimeout(async () => {
      try {
        const available = await checkName(name);
        setNameAvailable(available);
      } catch (err) {
        setNameAvailable(null);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [name, checkName]);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
  if (!name || !email || !password) return setError('Please fill all fields');
    if (password.length < 6) return setError('Password must be at least 6 characters');
    if (password !== confirm) return setError('Passwords do not match');
    if (nameAvailable === false) return setError('Name not available');
    setLoading(true);
    try {
      await register(email, password, name);
      navigate('/dashboard');
    } catch (err: any) {
      setError(err?.message || 'Registration failed');
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center gradient-bg px-4">
      <button onClick={() => navigate('/login')} className="fixed top-8 left-8 flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors">
        <ArrowLeft className="w-5 h-5" />
        <span>Back</span>
      </button>

      <div className="w-full max-w-md">
        <Card className="p-8" hover={false}>
          <h2 className="text-2xl font-bold mb-4">Create an account</h2>

          <form onSubmit={handleRegister} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Full name</label>
              <div className="relative">
                <input value={name} onChange={e => setName(e.target.value)} type="text" className="w-full pl-4 pr-4 py-3 rounded-xl bg-white/50 dark:bg-white/5 border border-gray-200 dark:border-gray-700 focus:outline-none focus:ring-2 focus:ring-violet-500" placeholder="Your full name" required />
              </div>
              {name && nameAvailable === false && (
                <div className="text-sm text-red-600 mt-2">Not available</div>
              )}
              {name && nameAvailable === true && (
                <div className="text-sm text-green-600 mt-2">Available</div>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input value={email} onChange={e => setEmail(e.target.value)} type="email" className="w-full pl-11 pr-4 py-3 rounded-xl bg-white/50 dark:bg-white/5 border border-gray-200 dark:border-gray-700 focus:outline-none focus:ring-2 focus:ring-violet-500" placeholder="you@example.com" required />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input value={password} onChange={e => setPassword(e.target.value)} type="password" className="w-full pl-11 pr-4 py-3 rounded-xl bg-white/50 dark:bg-white/5 border border-gray-200 dark:border-gray-700 focus:outline-none focus:ring-2 focus:ring-violet-500" placeholder="Create a password" required />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Confirm Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input value={confirm} onChange={e => setConfirm(e.target.value)} type="password" className="w-full pl-11 pr-4 py-3 rounded-xl bg-white/50 dark:bg-white/5 border border-gray-200 dark:border-gray-700 focus:outline-none focus:ring-2 focus:ring-violet-500" placeholder="Confirm password" required />
              </div>
            </div>

            {error && <div className="text-sm text-red-600">{error}</div>}

            <Button type="submit" variant="primary" className="w-full mt-4" disabled={nameAvailable === false}>{loading ? 'Creating...' : 'Create account'}</Button>
          </form>

          <div className="mt-4 text-center text-sm text-gray-600 dark:text-gray-400">
            Already have an account? <button onClick={() => navigate('/login')} className="text-violet-600">Login</button>
          </div>
        </Card>
      </div>
    </div>
  );
}
