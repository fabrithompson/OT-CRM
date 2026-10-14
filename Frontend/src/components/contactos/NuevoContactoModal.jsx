import React, { useState } from 'react';
import PropTypes from 'prop-types';
import api from '../../utils/api';
import { useLanguage } from '../../context/LangContext';
import { Modal, Field, Button } from '../ui';

const VACIO = { nombre: '', telefono: '', email: '', empresa: '', valorEstimado: '', notas: '' };

/**
 * Alta manual de un contacto (POST /clientes). El backend aplica las mismas
 * reglas que al importar o recibir un mensaje: teléfono normalizado, límite del
 * plan y duplicados por teléfono. Entra en la etapa inicial del embudo.
 */
export default function NuevoContactoModal({ open, onClose, onCreated }) {
    const { t } = useLanguage();
    const [form, setForm] = useState(VACIO);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    const cerrar = () => {
        if (saving) return;
        setForm(VACIO);
        setError('');
        onClose();
    };

    const cambiar = (campo) => (e) => setForm((prev) => ({ ...prev, [campo]: e.target.value }));

    const mensajeDeError = (err) => {
        const status = err.response?.status;
        if (status === 402) return t('contactos.errLimit');
        if (status === 409) return t('contactos.errDuplicate');
        const data = err.response?.data;
        const texto = typeof data === 'string' ? data : data?.error;
        return texto || t('contactos.errCreate');
    };

    const enviar = async (e) => {
        e.preventDefault();
        setSaving(true);
        setError('');
        try {
            const valor = form.valorEstimado === '' ? null : Number(form.valorEstimado);
            const res = await api.post('/clientes', {
                nombre: form.nombre,
                telefono: form.telefono,
                email: form.email,
                empresa: form.empresa,
                notas: form.notas,
                valorEstimado: valor,
            });
            setForm(VACIO);
            onCreated?.(res.data);
        } catch (err) {
            setError(mensajeDeError(err));
        } finally {
            setSaving(false);
        }
    };

    return (
        <Modal
            open={open}
            onClose={cerrar}
            title={t('contactos.newTitle')}
            footer={(
                <>
                    <Button variant="secondary" onClick={cerrar} disabled={saving}>{t('common.cancel')}</Button>
                    <Button variant="primary" type="submit" form="nuevo-contacto-form" loading={saving}>
                        {saving ? t('contactos.creating') : t('contactos.create')}
                    </Button>
                </>
            )}
        >
            <p className="text-muted nuevo-contacto__sub">{t('contactos.newSub')}</p>
            <form id="nuevo-contacto-form" className="nuevo-contacto__form" onSubmit={enviar} noValidate>
                <Field label={t('contactos.fName')} required>
                    <input type="text" value={form.nombre} onChange={cambiar('nombre')} maxLength={255} autoComplete="off" />
                </Field>
                <Field label={t('contactos.fPhone')} hint={t('contactos.fPhoneHint')} required>
                    <input type="tel" inputMode="tel" value={form.telefono} onChange={cambiar('telefono')} maxLength={30} autoComplete="off" />
                </Field>
                <div className="nuevo-contacto__row">
                    <Field label={t('contactos.fEmail')}>
                        <input type="email" value={form.email} onChange={cambiar('email')} maxLength={255} autoComplete="off" />
                    </Field>
                    <Field label={t('contactos.fCompany')}>
                        <input type="text" value={form.empresa} onChange={cambiar('empresa')} maxLength={255} autoComplete="off" />
                    </Field>
                </div>
                <Field label={t('contactos.fValue')}>
                    <input type="number" inputMode="decimal" min="0" step="0.01" value={form.valorEstimado} onChange={cambiar('valorEstimado')} />
                </Field>
                <Field label={t('contactos.fNotes')}>
                    <textarea rows={3} value={form.notas} onChange={cambiar('notas')} maxLength={500} />
                </Field>
                {error && <p className="nuevo-contacto__error" role="alert">{error}</p>}
            </form>
        </Modal>
    );
}

NuevoContactoModal.propTypes = {
    open: PropTypes.bool.isRequired,
    onClose: PropTypes.func.isRequired,
    onCreated: PropTypes.func,
};
