import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { imageToAvatar, saveUserProfile, useUserProfile } from '../lib/userProfile';
import { avatarColors } from '../lib/profile';
import { toast } from './Toasts';

/** Change your profile picture and display name. */
export function EditProfile({ id, onClose }: { id: string; onClose: () => void }) {
  const current = useUserProfile(id);
  const [name, setName] = useState(current.name ?? '');
  const [image, setImage] = useState<string | undefined>(current.image);
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const [a, b] = avatarColors(id);

  const pick = async (f: File | undefined) => {
    if (!f) return;
    setBusy(true);
    try {
      setImage(await imageToAvatar(f));
    } catch (e) {
      toast.err((e as Error).message || 'Could not read that image');
    } finally {
      setBusy(false);
      if (file.current) file.current.value = '';
    }
  };

  const save = () => {
    const err = saveUserProfile(id, { name, image });
    if (err) return toast.err(err);
    toast.ok('Profile updated');
    onClose();
  };

  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal panel pad edit-profile" role="dialog" aria-modal="true" aria-label="Edit profile" onClick={(e) => e.stopPropagation()}>
        <h3>Edit profile</h3>
        <div
          className="ep-photo"
          onClick={() => file.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            pick(e.dataTransfer.files[0]);
          }}
          style={image ? undefined : { background: `linear-gradient(135deg, ${a}, ${b})` }}
          role="button"
          tabIndex={0}
          aria-label="Change profile picture"
          onKeyDown={(e) => e.key === 'Enter' && file.current?.click()}
        >
          {image ? <img src={image} alt="" /> : <span>{(name || id).replace(/[^a-z0-9]/gi, '')[0]?.toUpperCase() ?? '?'}</span>}
          <span className="ep-overlay">{busy ? 'Loading…' : 'Change photo'}</span>
        </div>
        <input ref={file} type="file" accept="image/*" hidden onChange={(e) => pick(e.target.files?.[0])} />
        <div className="ep-actions">
          <button className="btn btn-sm" onClick={() => file.current?.click()} disabled={busy}>
            Upload image
          </button>
          {image && (
            <button className="btn btn-sm" onClick={() => setImage(undefined)}>
              Remove
            </button>
          )}
        </div>

        <div className="field">
          <div className="field-head">
            <label htmlFor="ep-name">Display name</label>
            <span className="muted small">{name.trim().length}/24</span>
          </div>
          <div className="input">
            <input id="ep-name" maxLength={24} placeholder="Pick a name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
        </div>
        <p className="muted small">Saved in this browser for this wallet.</p>

        <div className="leave-actions">
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={save} disabled={busy}>
            Save
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
