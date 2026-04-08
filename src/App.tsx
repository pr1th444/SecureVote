import React, { createContext, useContext, useEffect, useState } from 'react';
import { 
  auth, 
  db, 
  googleProvider, 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged, 
  User,
  collection,
  doc,
  getDoc,
  setDoc,
  onSnapshot,
  query,
  where,
  Timestamp,
  writeBatch,
  increment,
  handleFirestoreError,
  OperationType
} from './lib/firebase';
import { 
  Vote, 
  User as UserIcon, 
  LogOut, 
  Plus, 
  Trash2, 
  CheckCircle2, 
  Clock, 
  BarChart3, 
  ShieldCheck,
  ChevronRight,
  AlertCircle,
  Menu,
  X
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// --- Types ---
interface Election {
  id: string;
  title: string;
  description: string;
  startTime: Timestamp;
  endTime: Timestamp;
  isActive: boolean;
}

interface Candidate {
  id: string;
  name: string;
  bio: string;
  electionId: string;
  voteCount: number;
}

interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: 'admin' | 'voter';
}

// --- Context ---
interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  isAdmin: boolean;
  signIn: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};

// --- Components ---

const ErrorBoundary = ({ children }: { children: React.ReactNode }) => {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleError = (e: ErrorEvent) => {
      try {
        const parsed = JSON.parse(e.message);
        if (parsed.error) {
          setError(`Firestore Error: ${parsed.error} during ${parsed.operationType} on ${parsed.path}`);
        }
      } catch {
        setError(e.message);
      }
    };
    window.addEventListener('error', handleError);
    return () => window.removeEventListener('error', handleError);
  }, []);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-red-50 p-4">
        <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full border border-red-100">
          <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Something went wrong</h2>
          <p className="text-gray-600 mb-6">{error}</p>
          <button 
            onClick={() => window.location.reload()}
            className="w-full bg-red-600 text-white py-3 rounded-xl font-semibold hover:bg-red-700 transition-colors"
          >
            Reload Application
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

const Navbar = () => {
  const { user, profile, logout, isAdmin } = useAuth();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <nav className="bg-white/80 backdrop-blur-md border-b border-gray-100 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center gap-2">
            <div className="bg-blue-600 p-2 rounded-lg">
              <ShieldCheck className="w-6 h-6 text-white" />
            </div>
            <span className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-600">
              SecureVote
            </span>
          </div>

          <div className="hidden md:flex items-center gap-6">
            {user && (
              <>
                <span className="text-sm font-medium text-gray-600 flex items-center gap-2">
                  <UserIcon className="w-4 h-4" />
                  {profile?.displayName}
                  {isAdmin && <span className="bg-blue-100 text-blue-700 text-[10px] px-2 py-0.5 rounded-full uppercase font-bold">Admin</span>}
                </span>
                <button 
                  onClick={logout}
                  className="flex items-center gap-2 text-sm font-semibold text-gray-700 hover:text-red-600 transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  Logout
                </button>
              </>
            )}
          </div>

          <div className="md:hidden flex items-center">
            <button onClick={() => setIsOpen(!isOpen)} className="text-gray-600">
              {isOpen ? <X /> : <Menu />}
            </button>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {isOpen && (
          <motion.div 
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="md:hidden bg-white border-b border-gray-100 overflow-hidden"
          >
            <div className="px-4 pt-2 pb-6 space-y-4">
              {user && (
                <>
                  <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                    <UserIcon className="w-5 h-5 text-gray-400" />
                    <div>
                      <p className="text-sm font-bold text-gray-900">{profile?.displayName}</p>
                      <p className="text-xs text-gray-500">{profile?.email}</p>
                    </div>
                  </div>
                  <button 
                    onClick={logout}
                    className="w-full flex items-center gap-3 p-3 text-red-600 font-semibold hover:bg-red-50 rounded-xl transition-colors"
                  >
                    <LogOut className="w-5 h-5" />
                    Logout
                  </button>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
};

const AdminDashboard = () => {
  const [elections, setElections] = useState<Election[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [newElection, setNewElection] = useState({ title: '', description: '', startTime: '', endTime: '' });

  useEffect(() => {
    const q = collection(db, 'elections');
    return onSnapshot(q, (snapshot) => {
      setElections(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Election)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'elections'));
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const electionRef = doc(collection(db, 'elections'));
      await setDoc(electionRef, {
        title: newElection.title,
        description: newElection.description,
        startTime: Timestamp.fromDate(new Date(newElection.startTime)),
        endTime: Timestamp.fromDate(new Date(newElection.endTime)),
        isActive: true
      });
      setShowCreate(false);
      setNewElection({ title: '', description: '', startTime: '', endTime: '' });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'elections');
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Admin Dashboard</h1>
          <p className="text-gray-500">Manage your elections and candidates</p>
        </div>
        <button 
          onClick={() => setShowCreate(true)}
          className="bg-blue-600 text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 hover:bg-blue-700 shadow-lg shadow-blue-200 transition-all active:scale-95"
        >
          <Plus className="w-5 h-5" />
          New Election
        </button>
      </div>

      <AnimatePresence>
        {showCreate && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="bg-white p-8 rounded-2xl shadow-xl border border-gray-100"
          >
            <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="md:col-span-2">
                <label className="block text-sm font-bold text-gray-700 mb-2">Election Title</label>
                <input 
                  required
                  value={newElection.title}
                  onChange={e => setNewElection({ ...newElection, title: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                  placeholder="e.g. Student Council 2026"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-bold text-gray-700 mb-2">Description</label>
                <textarea 
                  value={newElection.description}
                  onChange={e => setNewElection({ ...newElection, description: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                  placeholder="Describe the purpose of this election..."
                  rows={3}
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">Start Time</label>
                <input 
                  required
                  type="datetime-local"
                  value={newElection.startTime}
                  onChange={e => setNewElection({ ...newElection, startTime: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">End Time</label>
                <input 
                  required
                  type="datetime-local"
                  value={newElection.endTime}
                  onChange={e => setNewElection({ ...newElection, endTime: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                />
              </div>
              <div className="md:col-span-2 flex justify-end gap-4 mt-4">
                <button 
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="px-6 py-3 rounded-xl font-bold text-gray-600 hover:bg-gray-100 transition-colors"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="bg-blue-600 text-white px-8 py-3 rounded-xl font-bold hover:bg-blue-700 transition-colors"
                >
                  Create Election
                </button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {elections.map(election => (
          <ElectionCard key={election.id} election={election} isAdmin={true} />
        ))}
      </div>
    </div>
  );
};

interface ElectionCardProps {
  election: Election;
  isAdmin: boolean;
  key?: React.Key;
}

const ElectionCard = ({ election, isAdmin }: ElectionCardProps) => {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [showAddCandidate, setShowAddCandidate] = useState(false);
  const [newCandidate, setNewCandidate] = useState({ name: '', bio: '' });
  const [hasVoted, setHasVoted] = useState(false);
  const [isVoting, setIsVoting] = useState(false);
  const { user } = useAuth();

  useEffect(() => {
    const q = collection(db, `elections/${election.id}/candidates`);
    const unsub = onSnapshot(q, (snapshot) => {
      setCandidates(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Candidate)));
    });

    if (user) {
      const voterRef = doc(db, 'voters', `${user.uid}_${election.id}`);
      getDoc(voterRef).then(doc => setHasVoted(doc.exists()));
    }

    return unsub;
  }, [election.id, user]);

  const handleAddCandidate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const candidateRef = doc(collection(db, `elections/${election.id}/candidates`));
      await setDoc(candidateRef, {
        name: newCandidate.name,
        bio: newCandidate.bio,
        electionId: election.id,
        voteCount: 0
      });
      setShowAddCandidate(false);
      setNewCandidate({ name: '', bio: '' });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `elections/${election.id}/candidates`);
    }
  };

  const handleVote = async (candidateId: string) => {
    if (!user || hasVoted || isVoting) return;
    setIsVoting(true);
    try {
      const batch = writeBatch(db);
      const voterRef = doc(db, 'voters', `${user.uid}_${election.id}`);
      const candidateRef = doc(db, `elections/${election.id}/candidates`, candidateId);
      const voteRef = doc(collection(db, 'votes'));

      batch.set(voterRef, {
        userId: user.uid,
        electionId: election.id,
        hasVoted: true
      });

      batch.set(voteRef, {
        electionId: election.id,
        candidateId: candidateId
      });

      batch.update(candidateRef, {
        voteCount: increment(1)
      });

      await batch.commit();
      setHasVoted(true);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'voting_transaction');
    } finally {
      setIsVoting(false);
    }
  };

  const isPast = election.endTime.toDate() < new Date();
  const isFuture = election.startTime.toDate() > new Date();
  const isOngoing = !isPast && !isFuture;

  return (
    <motion.div 
      layout
      className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden flex flex-col"
    >
      <div className="p-6 border-b border-gray-50 bg-gray-50/50">
        <div className="flex justify-between items-start mb-4">
          <div className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
            isOngoing ? 'bg-green-100 text-green-700' : 
            isPast ? 'bg-gray-100 text-gray-500' : 'bg-blue-100 text-blue-700'
          }`}>
            {isOngoing ? 'Ongoing' : isPast ? 'Completed' : 'Upcoming'}
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-500 font-medium">
            <Clock className="w-3 h-3" />
            {election.endTime.toDate().toLocaleDateString()}
          </div>
        </div>
        <h3 className="text-xl font-bold text-gray-900 mb-2">{election.title}</h3>
        <p className="text-sm text-gray-600 line-clamp-2">{election.description}</p>
      </div>

      <div className="p-6 flex-1 space-y-4">
        <div className="flex justify-between items-center">
          <h4 className="text-sm font-bold text-gray-400 uppercase tracking-widest">Candidates</h4>
          {isAdmin && !isPast && (
            <button 
              onClick={() => setShowAddCandidate(!showAddCandidate)}
              className="text-blue-600 text-xs font-bold hover:underline"
            >
              + Add Candidate
            </button>
          )}
        </div>

        <AnimatePresence>
          {showAddCandidate && (
            <motion.form 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              onSubmit={handleAddCandidate}
              className="bg-blue-50 p-4 rounded-xl space-y-3 overflow-hidden"
            >
              <input 
                required
                placeholder="Candidate Name"
                value={newCandidate.name}
                onChange={e => setNewCandidate({ ...newCandidate, name: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-blue-100 outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              />
              <textarea 
                placeholder="Short Bio"
                value={newCandidate.bio}
                onChange={e => setNewCandidate({ ...newCandidate, bio: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-blue-100 outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                rows={2}
              />
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setShowAddCandidate(false)} className="text-xs font-bold text-gray-500">Cancel</button>
                <button type="submit" className="bg-blue-600 text-white px-4 py-1.5 rounded-lg text-xs font-bold">Save</button>
              </div>
            </motion.form>
          )}
        </AnimatePresence>

        <div className="space-y-3">
          {candidates.map(candidate => (
            <div key={candidate.id} className={`group p-4 rounded-xl border transition-all ${
              hasVoted ? 'border-gray-100 bg-gray-50/30' : 'border-gray-100 hover:border-blue-200 hover:bg-blue-50/30'
            }`}>
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-bold text-gray-900">{candidate.name}</p>
                  <p className="text-xs text-gray-500 mt-1">{candidate.bio}</p>
                </div>
                {isOngoing && !isAdmin && !hasVoted && (
                  <button 
                    disabled={isVoting}
                    onClick={() => handleVote(candidate.id)}
                    className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all active:scale-95 flex items-center gap-2 ${
                      isVoting 
                        ? 'bg-gray-100 text-gray-400 cursor-not-allowed' 
                        : 'bg-white border border-blue-200 text-blue-600 hover:bg-blue-600 hover:text-white'
                    }`}
                  >
                    {isVoting && <div className="w-3 h-3 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />}
                    {isVoting ? 'Voting...' : 'Vote'}
                  </button>
                )}
                {(hasVoted || isPast || isAdmin) && (
                  <div className="text-right">
                    <p className="text-lg font-black text-blue-600">{candidate.voteCount}</p>
                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-tighter">Votes</p>
                  </div>
                )}
              </div>
            </div>
          ))}
          {candidates.length === 0 && (
            <div className="text-center py-8 text-gray-400 italic text-sm">
              No candidates added yet
            </div>
          )}
        </div>
      </div>

      {hasVoted && isOngoing && (
        <div className="p-4 bg-green-50 flex items-center justify-center gap-2 text-green-700 text-sm font-bold border-t border-green-100">
          <CheckCircle2 className="w-4 h-4" />
          Vote Recorded Successfully
        </div>
      )}
    </motion.div>
  );
};

const VoterDashboard = () => {
  const [elections, setElections] = useState<Election[]>([]);
  const [filter, setFilter] = useState<'ongoing' | 'past' | 'upcoming'>('ongoing');

  useEffect(() => {
    const q = collection(db, 'elections');
    return onSnapshot(q, (snapshot) => {
      setElections(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Election)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'elections'));
  }, []);

  const filteredElections = elections.filter(e => {
    const now = new Date();
    if (filter === 'ongoing') return e.startTime.toDate() <= now && e.endTime.toDate() >= now;
    if (filter === 'past') return e.endTime.toDate() < now;
    if (filter === 'upcoming') return e.startTime.toDate() > now;
    return true;
  });

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Voter Portal</h1>
          <p className="text-gray-500">Securely cast your vote and view results</p>
        </div>
        <div className="flex bg-gray-100 p-1 rounded-xl">
          {(['ongoing', 'upcoming', 'past'] as const).map(f => (
            <button 
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${
                filter === f ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {filteredElections.map(election => (
          <ElectionCard key={election.id} election={election} isAdmin={false} />
        ))}
        {filteredElections.length === 0 && (
          <div className="col-span-full py-20 text-center">
            <div className="bg-gray-50 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4">
              <Vote className="w-10 h-10 text-gray-300" />
            </div>
            <h3 className="text-lg font-bold text-gray-900">No {filter} elections</h3>
            <p className="text-gray-500">Check back later for new voting opportunities.</p>
          </div>
        )}
      </div>
    </div>
  );
};

const LandingPage = () => {
  const { signIn } = useAuth();

  return (
    <div className="min-h-[calc(100vh-64px)] flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Background Decorations */}
      <div className="absolute top-0 left-0 w-full h-full -z-10 overflow-hidden">
        <div className="absolute top-1/4 -left-20 w-96 h-96 bg-blue-100 rounded-full blur-3xl opacity-50" />
        <div className="absolute bottom-1/4 -right-20 w-96 h-96 bg-indigo-100 rounded-full blur-3xl opacity-50" />
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-4xl w-full text-center space-y-8"
      >
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-700 rounded-full text-sm font-bold mb-4">
          <ShieldCheck className="w-4 h-4" />
          Blockchain-Inspired Security & Privacy
        </div>
        
        <h1 className="text-5xl md:text-7xl font-black text-gray-900 tracking-tight leading-tight">
          The Future of <br />
          <span className="bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-600">
            Digital Democracy
          </span>
        </h1>
        
        <p className="text-xl text-gray-600 max-w-2xl mx-auto leading-relaxed">
          A secure, reliable, and efficient voting platform designed for colleges, 
          organizations, and clubs. Cast your vote remotely with total anonymity.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
          <button 
            onClick={signIn}
            className="w-full sm:w-auto bg-blue-600 text-white px-10 py-4 rounded-2xl font-bold text-lg hover:bg-blue-700 shadow-xl shadow-blue-200 transition-all active:scale-95 flex items-center justify-center gap-3"
          >
            Get Started Now
            <ChevronRight className="w-5 h-5" />
          </button>
          <div className="flex -space-x-3">
            {[1, 2, 3, 4].map(i => (
              <img 
                key={i}
                src={`https://picsum.photos/seed/user${i}/100/100`}
                className="w-10 h-10 rounded-full border-2 border-white shadow-sm"
                referrerPolicy="no-referrer"
                alt="User"
              />
            ))}
            <div className="w-10 h-10 rounded-full bg-gray-100 border-2 border-white flex items-center justify-center text-[10px] font-bold text-gray-500">
              +2k
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 pt-16">
          <div className="p-6 bg-white rounded-2xl shadow-sm border border-gray-100">
            <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center mb-4 mx-auto">
              <ShieldCheck className="w-6 h-6 text-blue-600" />
            </div>
            <h3 className="font-bold text-gray-900 mb-2">Secure & Private</h3>
            <p className="text-sm text-gray-500">One-time voting lock and anonymized vote storage ensures integrity.</p>
          </div>
          <div className="p-6 bg-white rounded-2xl shadow-sm border border-gray-100">
            <div className="w-12 h-12 bg-indigo-50 rounded-xl flex items-center justify-center mb-4 mx-auto">
              <BarChart3 className="w-6 h-6 text-indigo-600" />
            </div>
            <h3 className="font-bold text-gray-900 mb-2">Real-time Results</h3>
            <p className="text-sm text-gray-500">Live vote counting and instant result generation after elections end.</p>
          </div>
          <div className="p-6 bg-white rounded-2xl shadow-sm border border-gray-100">
            <div className="w-12 h-12 bg-purple-50 rounded-xl flex items-center justify-center mb-4 mx-auto">
              <Clock className="w-6 h-6 text-purple-600" />
            </div>
            <h3 className="font-bold text-gray-900 mb-2">Time-Bound</h3>
            <p className="text-sm text-gray-500">Fair elections with strictly enforced start and end periods.</p>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    return onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        const profileRef = doc(db, 'users', u.uid);
        const profileSnap = await getDoc(profileRef);
        
        if (profileSnap.exists()) {
          setProfile(profileSnap.data() as UserProfile);
        } else {
          // Default to voter role
          const newProfile: UserProfile = {
            uid: u.uid,
            email: u.email || '',
            displayName: u.displayName || 'Voter',
            role: u.email === 'pritha.d06@gmail.com' ? 'admin' : 'voter'
          };
          await setDoc(profileRef, newProfile);
          setProfile(newProfile);
        }
      } else {
        setProfile(null);
      }
      setLoading(false);
    });
  }, []);

  const signIn = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      console.error('Sign in error:', err);
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.error('Logout error:', err);
    }
  };

  const value = {
    user,
    profile,
    loading,
    isAdmin: profile?.role === 'admin',
    signIn,
    logout
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <div className="min-h-screen bg-gray-50 font-sans text-gray-900 selection:bg-blue-100 selection:text-blue-900">
          <Navbar />
          <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <AuthContent />
          </main>
          <footer className="py-12 border-t border-gray-100 bg-white">
            <div className="max-w-7xl mx-auto px-4 text-center">
              <div className="flex items-center justify-center gap-2 mb-4">
                <ShieldCheck className="w-5 h-5 text-blue-600" />
                <span className="font-bold text-gray-900">SecureVote</span>
              </div>
              <p className="text-sm text-gray-500">© 2026 SecureVote DBMS Project. All rights reserved.</p>
              <div className="flex justify-center gap-6 mt-6">
                <a href="#" className="text-xs font-bold text-gray-400 hover:text-blue-600 uppercase tracking-widest">Privacy Policy</a>
                <a href="#" className="text-xs font-bold text-gray-400 hover:text-blue-600 uppercase tracking-widest">Terms of Service</a>
                <a href="#" className="text-xs font-bold text-gray-400 hover:text-blue-600 uppercase tracking-widest">Support</a>
              </div>
            </div>
          </footer>
        </div>
      </AuthProvider>
    </ErrorBoundary>
  );
}

const AuthContent = () => {
  const { user, loading, isAdmin } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <LandingPage />;
  }

  return isAdmin ? <AdminDashboard /> : <VoterDashboard />;
}
