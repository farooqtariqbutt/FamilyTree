import React, { useState, useCallback } from 'react';
import Cropper from 'react-easy-crop';
import type { Point, Area } from 'react-easy-crop';
import Modal from './ui/Modal.tsx';
import Button from './ui/Button.tsx';
import { getCroppedImg, compressImage } from '../utils/imageUtils.ts';

interface ImageEditorProps {
    imageSrc: string;
    onClose: () => void;
    onSave: (croppedImage: string) => void;
}

const ImageEditor: React.FC<ImageEditorProps> = ({ imageSrc, onClose, onSave }) => {
    const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
    const [zoom, setZoom] = useState(1);
    const [rotation, setRotation] = useState(0);
    const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    const onCropComplete = useCallback((_croppedArea: Area, croppedAreaPixels: Area) => {
        setCroppedAreaPixels(croppedAreaPixels);
    }, []);

    const handleSave = useCallback(async () => {
        if (!croppedAreaPixels) return;
        setIsSaving(true);
        try {
            const croppedImage = await getCroppedImg(imageSrc, croppedAreaPixels, rotation);
            const compressedImage = await compressImage(croppedImage);
            onSave(compressedImage);
        } catch (e) {
            console.error(e);
            alert('An error occurred while cropping the image.');
        } finally {
            setIsSaving(false);
            onClose(); // Close the modal after saving
        }
    }, [imageSrc, croppedAreaPixels, rotation, onSave, onClose]);

    return (
        <Modal isOpen={true} onClose={onClose} title="Edit Photo">
            <div className="relative w-full h-96 bg-gray-200 dark:bg-gray-900">
                <Cropper
                    image={imageSrc}
                    crop={crop}
                    zoom={zoom}
                    rotation={rotation}
                    aspect={1}
                    onCropChange={setCrop}
                    onZoomChange={setZoom}
                    onRotationChange={setRotation}
                    onCropComplete={onCropComplete}
                />
            </div>
            <div className="p-4 space-y-4">
                <div>
                    <label htmlFor="zoom" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Zoom</label>
                    <input
                        id="zoom"
                        type="range"
                        value={zoom}
                        min={1}
                        max={3}
                        step={0.1}
                        onChange={(e) => setZoom(Number(e.target.value))}
                        className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700"
                        aria-label="Zoom slider"
                    />
                </div>
                 <div>
                    <label htmlFor="rotation" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Rotation</label>
                    <input
                        id="rotation"
                        type="range"
                        value={rotation}
                        min={0}
                        max={360}
                        step={1}
                        onChange={(e) => setRotation(Number(e.target.value))}
                        className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700"
                        aria-label="Rotation slider"
                    />
                </div>
            </div>
            <div className="flex justify-end space-x-2 p-4 border-t border-gray-200 dark:border-gray-700">
                <Button variant="secondary" onClick={onClose}>Cancel</Button>
                <Button onClick={handleSave} disabled={isSaving}>
                    {isSaving ? 'Saving...' : 'Save Photo'}
                </Button>
            </div>
        </Modal>
    );
};

export default ImageEditor;
