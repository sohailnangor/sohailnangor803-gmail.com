import React, { useEffect, useState } from 'react';
import type { UserProfile } from '../types/video';

interface ProfileModalProps {
  isOpen: boolean;
  userProfile: UserProfile | null;
  adminUnlocked: boolean;
  isSubmitting: boolean;
  errorMsg: string | null;
  onClose: () => void;
  onAuthenticate: (payload: {
    firstName: string;
    lastName: string;
    password: string;
  }) => void;
  onSignOut: () => void;
  onOpenAdminPanel: () => void;
}

export const ProfileModal: React.FC<ProfileModalProps> = ({
  isOpen,
  userProfile,
  adminUnlocked,
  isSubmitting,
  errorMsg,
  onClose,
  onAuthenticate,
  onSignOut,
  onOpenAdminPanel,
}) => {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [password, setPassword] = useState('');

  useEffect(() => {
    if (isOpen) {
      setFirstName(userProfile?.firstName || '');
      setLastName(userProfile?.lastName || '');
      setPassword('');
    }
  }, [isOpen, userProfile]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onAuthenticate({ firstName, lastName, password });
  };

  const cardInitials = userProfile
    ? `${userProfile.firstName[0] || ''}${userProfile.lastName[0] || ''}`.toUpperCase() || 'U'
    : 'A';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-3"
      role="dialog"
      aria-modal="true"
      aria-labelledby="profile-modal-title"
    >
      <div className="w-full max-w-md bg-[#181818] border border-[#272727] shadow-2xl overflow-hidden animate-fade-in">
        <div className="px-4 py-3.5 border-b border-[#272727] flex items-center justify-between gap-2">
          <div>
            <h2 id="profile-modal-title" className="text-sm font-bold text-white">
              Profile
            </h2>
            <p className="text-[11px] text-gray-400">
              Account card and cross-device sync
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 bg-[#222222] hover:bg-[#2d2d2d] text-gray-300 flex items-center justify-center font-bold cursor-pointer"
            aria-label="Close profile dialog"
          >
            &times;
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Profile Card */}
          {(adminUnlocked || userProfile) && (
            <div className="p-3.5 bg-[#0f0f0f] border border-[#272727] space-y-3">
              <div className="flex items-center gap-3">
                <div
                  className={`w-10 h-10 flex items-center justify-center font-extrabold text-sm shrink-0 ${
                    adminUnlocked ? 'bg-amber-400 text-black' : 'bg-[#ff0033] text-white'
                  }`}
                >
                  {cardInitials}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-white truncate">
                    {userProfile
                      ? `${userProfile.firstName} ${userProfile.lastName}`.trim()
                      : 'Active Profile'}
                  </p>
                  <p className="text-[11px] text-gray-400">
                    {adminUnlocked
                      ? 'Studio access enabled'
                      : `${userProfile?.subscribedFolders.length || 0} subscribed playlist${
                          (userProfile?.subscribedFolders.length || 0) === 1 ? '' : 's'
                        }`}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {adminUnlocked && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenAdminPanel();
                    }}
                    className="flex-1 py-2 bg-amber-400 hover:bg-amber-300 text-black text-xs font-extrabold cursor-pointer"
                  >
                    Open Admin Panel
                  </button>
                )}
                <button
                  type="button"
                  onClick={onSignOut}
                  className="px-3 py-2 bg-[#222222] hover:bg-[#2d2d2d] text-gray-200 text-xs font-semibold cursor-pointer"
                >
                  Sign Out
                </button>
              </div>
            </div>
          )}

          {/* Account Sign-In Form */}
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="profileFirstName" className="block text-xs font-semibold text-gray-300 mb-1">
                  First Name
                </label>
                <input
                  id="profileFirstName"
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="First name"
                  autoFocus
                  className="w-full h-10 px-3 bg-[#0f0f0f] border border-[#272727] focus:border-white text-sm text-white placeholder-gray-500 focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="profileLastName" className="block text-xs font-semibold text-gray-300 mb-1">
                  Last Name
                </label>
                <input
                  id="profileLastName"
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Last name"
                  className="w-full h-10 px-3 bg-[#0f0f0f] border border-[#272727] focus:border-white text-sm text-white placeholder-gray-500 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label htmlFor="profilePassword" className="block text-xs font-semibold text-gray-300 mb-1">
                Password
              </label>
              <input
                id="profilePassword"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                className="w-full h-10 px-3 bg-[#0f0f0f] border border-[#272727] focus:border-white text-sm text-white placeholder-gray-500 focus:outline-none"
              />
            </div>

            {errorMsg && (
              <p className="text-xs text-red-400 bg-red-950/40 border border-red-800/60 px-3 py-2">
                {errorMsg}
              </p>
            )}

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-2 bg-[#222222] hover:bg-[#2d2d2d] text-gray-300 text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-4 py-2 bg-[#ff0033] hover:bg-red-600 disabled:opacity-50 text-white text-xs font-bold cursor-pointer"
              >
                {isSubmitting ? 'Signing In...' : 'Continue'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
